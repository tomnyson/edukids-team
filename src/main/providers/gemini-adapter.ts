import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'

export async function runGemini(
  apiKey: string,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const startedAt = Date.now()
  const model = request.modelId || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm.]`
    : request.systemPrompt

  const contents = [
    {
      role: 'user',
      parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemMessage}` }]
    },
    ...request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ]

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
    signal: request.signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API returned status ${response.status}: ${errorText}`)
  }

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullContent = ''

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

      try {
        const json = JSON.parse(dataStr)
        const parts = json.candidates?.[0]?.content?.parts
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              fullContent += part.text
              callbacks.onContentDelta(part.text)
            }
          }
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }

  return {
    text: fullContent,
    reasoningText: '',
    durationMs: Date.now() - startedAt
  }
}
