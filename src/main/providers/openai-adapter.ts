import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
}

export async function runOpenAICompatible(
  apiKey: string,
  customBaseUrl: string | null,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  let baseUrl = customBaseUrl?.trim() || DEFAULT_ENDPOINTS[request.provider] || 'https://api.openai.com/v1'

  if (request.provider === 'ollama' && !customBaseUrl?.trim()) {
    try {
      const probe = await fetch('http://localhost:11434/api/version', { signal: AbortSignal.timeout(500) })
      if (!probe.ok) baseUrl = 'http://localhost:1234/v1'
    } catch {
      baseUrl = 'http://localhost:1234/v1'
    }
  }

  const startedAt = Date.now()

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm. Cut through corporate buzzwords and speak candidly.]`
    : request.systemPrompt

  const payload = {
    model: request.modelId,
    messages: [
      { role: 'system', content: systemMessage },
      ...request.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    temperature: request.temperature ?? 0.7,
    stream: true
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: request.signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Provider ${request.provider} returned status ${response.status}: ${errorText}`)
  }

  let fullContent = ''
  let fullReasoning = ''

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let inThinkTag = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const dataStr = trimmed.slice(6).trim()
      if (dataStr === '[DONE]') break

      try {
        const json = JSON.parse(dataStr)
        const delta = json.choices?.[0]?.delta
        if (!delta) continue

        // Handle explicit reasoning_content (DeepSeek R1 / Grok 3)
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content
          callbacks.onReasoningDelta?.(delta.reasoning_content)
        }

        // Handle content, checking for inline <think> tags if reasoning_content is not separated
        if (delta.content) {
          let text = delta.content as string
          if (text.includes('<think>')) {
            inThinkTag = true
            text = text.replace('<think>', '')
          }
          if (inThinkTag) {
            if (text.includes('</think>')) {
              const [thinkPart, contentPart] = text.split('</think>')
              inThinkTag = false
              fullReasoning += thinkPart
              callbacks.onReasoningDelta?.(thinkPart)
              if (contentPart) {
                fullContent += contentPart
                callbacks.onContentDelta(contentPart)
              }
            } else {
              fullReasoning += text
              callbacks.onReasoningDelta?.(text)
            }
          } else {
            fullContent += text
            callbacks.onContentDelta(text)
          }
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }

  return {
    text: fullContent,
    reasoningText: fullReasoning,
    durationMs: Date.now() - startedAt
  }
}
