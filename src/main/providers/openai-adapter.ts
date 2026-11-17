import type { ProviderId } from '@shared/types'
import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { INITIAL_STREAM_STATE, feedOpenAIStream } from './openai-stream'

/**
 * Providers that only report token usage on a stream when asked. The others are not sent the
 * option, since a server that does not know it may reject the request; usage is still read from
 * any stream that carries it.
 */
const USAGE_ON_REQUEST: readonly ProviderId[] = ['openai', 'deepseek']

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
    stream: true,
    ...(USAGE_ON_REQUEST.includes(request.provider)
      ? { stream_options: { include_usage: true } }
      : {})
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

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let fullContent = ''
  let fullReasoning = ''
  let tokensUsed: number | undefined
  let state = INITIAL_STREAM_STATE

  const take = (chunk: string): void => {
    const step = feedOpenAIStream(state, chunk)
    state = step.state
    for (const event of step.events) {
      if (event.type === 'content') {
        fullContent += event.text
        callbacks.onContentDelta(event.text)
      } else if (event.type === 'reasoning') {
        fullReasoning += event.text
        callbacks.onReasoningDelta?.(event.text)
      } else {
        tokensUsed = event.totalTokens
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    take(decoder.decode(value, { stream: true }))
  }
  // A last line with no newline after it would otherwise stay in the buffer
  take(`${decoder.decode()}\n`)

  return {
    text: fullContent,
    reasoningText: fullReasoning,
    durationMs: Date.now() - startedAt,
    tokensUsed
  }
}
