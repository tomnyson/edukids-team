import type { EffortId, ModelId } from './types'

/** Prompts one conversation may hold waiting behind the one that is running. */
export const MAX_QUEUED = 20

/** Solo chats and company meetings queue separately, each per conversation. */
export type QueueKind = 'solo' | 'company'

export function isQueueKind(value: unknown): value is QueueKind {
  return value === 'solo' || value === 'company'
}

/** Queues are keyed by conversation; the id comes from the renderer, so it is checked. */
export function isConversationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** What the renderer sees of one queued prompt; attachments are counted, not listed. */
export interface QueuedPrompt {
  readonly id: string
  readonly prompt: string
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly attachmentCount: number
}

/** One conversation's queue: what runs now, what waits, and whether waiting is on hold. */
export interface QueueSnapshot {
  readonly kind: QueueKind
  readonly conversationId: number
  readonly running: QueuedPrompt | null
  readonly waiting: readonly QueuedPrompt[]
  /** Set after a failed run or a stop while prompts waited; cleared by resume or clear. */
  readonly paused: boolean
}

/** A solo prompt to queue; the same shape `ask` takes. */
export interface QueueSubmitRequest {
  readonly conversationId: number
  readonly prompt: string
  readonly model?: ModelId | null
  readonly effort?: EffortId | null
  readonly attachments?: readonly string[]
}
