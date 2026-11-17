/**
 * The pure half of the chat queue on screen: how stream events move the pending turn, how
 * stored turns join the transcript, and what retry may re-send. Relative imports only, so the
 * tests load it without a bundler.
 */
import {
  MAX_QUEUED,
  type QueueKind,
  type QueueSnapshot,
  type QueuedPrompt
} from '../../../shared/queue'
import { EFFORTS, MODELS } from '../../../shared/types'
import type { EffortId, Message, ModelId, StreamEvent } from '../../../shared/types'

/** A turn that is still running: the prompt is known, the answer is arriving. */
export interface PendingTurn {
  readonly prompt: string
  readonly streamed: string
  readonly activeTool: string | null
}

/** What the composer had staged when the prompt was sent. */
export interface SendOptions {
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly attachments: readonly string[]
}

/** One prompt as it was sent, kept so a failed run can be sent again as it was. */
export interface SentPrompt {
  readonly prompt: string
  readonly options: SendOptions
}

/** Every queued prompt, plus the running one: older sends can no longer fail. */
const SENT_LIMIT = MAX_QUEUED + 1

export const startedTurn = (prompt: string): PendingTurn => ({
  prompt,
  streamed: '',
  activeTool: null
})

/** The pending turn after one stream event; output with no started turn is dropped. */
export function nextPending(current: PendingTurn | null, event: StreamEvent): PendingTurn | null {
  switch (event.type) {
    case 'started':
      return startedTurn(event.prompt)
    case 'delta':
      return current ? { ...current, streamed: current.streamed + event.text } : null
    case 'tool':
      return current ? { ...current, activeTool: event.name } : null
    case 'settled':
      return null
  }
}

/** Appends a stored turn unless it is already there; a duplicate keeps the same list. */
export function withMessage(messages: readonly Message[], message: Message): readonly Message[] {
  return messages.some((existing) => existing.id === message.id) ? messages : [...messages, message]
}

export function isSnapshotFor(
  snapshot: QueueSnapshot | null,
  kind: QueueKind,
  conversationId: number | null
): snapshot is QueueSnapshot {
  return snapshot !== null && snapshot.kind === kind && snapshot.conversationId === conversationId
}

export function rememberSent(log: readonly SentPrompt[], sent: SentPrompt): readonly SentPrompt[] {
  return [...log, sent].slice(-SENT_LIMIT)
}

/** The latest send of this prompt text, or null when it is not one this pane sent. */
export function findSent(log: readonly SentPrompt[], prompt: string | null): SentPrompt | null {
  if (prompt === null) return null
  return log.findLast((sent) => sent.prompt === prompt) ?? null
}

/**
 * Retry would put the failed prompt behind the ones waiting, out of the order they were
 * sent in; while prompts wait on a paused queue, Resume and Clear are the choices.
 */
export function canRetry(sent: SentPrompt | null, paused: boolean, waiting: number): boolean {
  return sent !== null && !(paused && waiting > 0)
}

/** The short labels shown beside a waiting prompt: what it runs with, and what it carries. */
export function describeQueued(prompt: QueuedPrompt): readonly string[] {
  const model = MODELS.find((entry) => entry.id === prompt.model)?.label
  const effort = EFFORTS.find((entry) => entry.id === prompt.effort)?.label
  const files =
    prompt.attachmentCount > 0
      ? `${prompt.attachmentCount} ${prompt.attachmentCount === 1 ? 'file' : 'files'}`
      : undefined
  return [model, effort, files].filter((label): label is string => label !== undefined)
}
