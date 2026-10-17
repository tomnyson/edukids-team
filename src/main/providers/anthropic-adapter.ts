import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { runClaude } from '../claude/runner'
import { randomUUID } from 'crypto'

export async function runAnthropic(
  apiKey: string | null,
  customBaseUrl: string | null,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const startedAt = Date.now()
  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm.]`
    : request.systemPrompt

  // If no API key is provided, fallback to Claude CLI
  if (!apiKey?.trim()) {
    const prompt = `${systemMessage}\n\n${request.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`
    const abortController = new AbortController()
    if (request.signal) {
      request.signal.addEventListener('abort', () => abortController.abort(), { once: true })
    }

    let streamed = ''
    const outcome = await runClaude({
      prompt,
      sessionId: randomUUID(),
      resume: false,
      cwd: process.cwd(),
      model: null,
      effort: null,
      addDirs: [],
      signal: abortController.signal,
      onDelta: (chunk) => {
        streamed += chunk
        callbacks.onContentDelta(chunk)
      },
      onTool: () => {}
    })

    if (outcome.error) {
      throw new Error(outcome.error.message)
    }

    return {
      text: outcome.text || streamed,
      reasoningText: '',
      durationMs: Date.now() - startedAt
    }
  }

  // Direct Anthropic Messages API
  const baseUrl = customBaseUrl?.trim() || 'https://api.anthropic.com/v1'
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: request.modelId,
      system: systemMessage,
      messages: request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      temperature: request.temperature ?? 0.7,
      stream: true
    }),
    signal: request.signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API returned status ${response.status}: ${errorText}`)
  }

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullContent = ''
  let fullReasoning = ''

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
        if (json.type === 'content_block_delta') {
          const delta = json.delta
          if (delta.type === 'thinking_delta') {
            fullReasoning += delta.thinking
            callbacks.onReasoningDelta?.(delta.thinking)
          } else if (delta.type === 'text_delta') {
            fullContent += delta.text
            callbacks.onContentDelta(delta.text)
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
