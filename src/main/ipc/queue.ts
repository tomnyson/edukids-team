/**
 * The queue channels both kinds share: read, resume, clear, and take a prompt out. Submitting
 * is per kind (`queue:submit` for solo chats, `companies:ask-stream` for meetings).
 */
import { ipcMain } from 'electron'
import { QUEUE_CHANNELS } from '@shared/ipc'
import { isConversationId, isQueueKind, type QueueKind, type QueueSnapshot } from '@shared/queue'
import { toSnapshot, type PromptDescription } from '../queue/jobs'
import type { LaneState } from '../queue/queue-state'
import type { QueueRunner } from '../queue/runner'
import { push, type WindowGetter } from './push'
import { fail, guard, ok } from './result'

export interface QueueControls {
  readonly remove: (conversationId: number, itemId: string) => boolean
  readonly resume: (conversationId: number) => void
  readonly clear: (conversationId: number) => void
  readonly snapshot: (conversationId: number) => QueueSnapshot
}

export function queueControls<J, R>(
  kind: QueueKind,
  runner: QueueRunner<J, R>,
  describe: (job: J) => PromptDescription
): QueueControls {
  return {
    remove: (conversationId, itemId) => runner.remove(conversationId, itemId),
    resume: (conversationId) => runner.resume(conversationId),
    clear: (conversationId) => runner.clear(conversationId),
    snapshot: (conversationId) =>
      toSnapshot(kind, conversationId, runner.lane(conversationId), describe)
  }
}

/** A runner's change listener: every change reaches the renderer as a fresh snapshot. */
export function pushSnapshots<J>(
  kind: QueueKind,
  describe: (job: J) => PromptDescription,
  getWindow: WindowGetter
): (conversationId: number, lane: LaneState<J>) => void {
  return (conversationId, lane) =>
    push(getWindow, QUEUE_CHANNELS.changed, toSnapshot(kind, conversationId, lane, describe))
}

const unknownQueue = fail({ code: 'INVALID_INPUT', message: 'Unknown queue.' })

export function registerQueueIpcHandlers(
  controls: Readonly<Record<QueueKind, QueueControls>>
): void {
  const pick = (
    kind: unknown,
    id: unknown
  ): { readonly lane: QueueControls; readonly id: number } | null =>
    isQueueKind(kind) && isConversationId(id) ? { lane: controls[kind], id } : null

  ipcMain.handle(
    QUEUE_CHANNELS.state,
    guard('queue', (_event, kind: unknown, id: unknown) => {
      const target = pick(kind, id)
      return target ? ok(target.lane.snapshot(target.id)) : unknownQueue
    })
  )

  /** Waiting prompts only: the running one is stopped, never removed. */
  ipcMain.handle(
    QUEUE_CHANNELS.remove,
    guard('queue', (_event, kind: unknown, id: unknown, itemId: unknown) => {
      const target = pick(kind, id)
      if (!target || typeof itemId !== 'string') return unknownQueue
      return ok(target.lane.remove(target.id, itemId))
    })
  )

  ipcMain.handle(
    QUEUE_CHANNELS.resume,
    guard('queue', (_event, kind: unknown, id: unknown) => {
      const target = pick(kind, id)
      if (!target) return unknownQueue
      target.lane.resume(target.id)
      return ok(target.lane.snapshot(target.id))
    })
  )

  ipcMain.handle(
    QUEUE_CHANNELS.clear,
    guard('queue', (_event, kind: unknown, id: unknown) => {
      const target = pick(kind, id)
      if (!target) return unknownQueue
      target.lane.clear(target.id)
      return ok(target.lane.snapshot(target.id))
    })
  )
}
