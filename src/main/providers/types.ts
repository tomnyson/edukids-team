import type { ProviderId } from '@shared/types'

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
}

export interface LLMRequest {
  readonly provider: ProviderId
  readonly modelId: string
  readonly systemPrompt: string
  readonly messages: readonly ChatMessage[]
  readonly temperature?: number
  readonly funMode?: boolean
  readonly signal?: AbortSignal
}

export interface LLMCallbacks {
  readonly onReasoningDelta?: (text: string) => void
  readonly onContentDelta: (text: string) => void
}

export interface LLMRunResult {
  readonly text: string
  readonly reasoningText: string
  readonly durationMs: number
  readonly tokensUsed?: number
}
