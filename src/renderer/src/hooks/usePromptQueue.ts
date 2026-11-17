import { useCallback, useEffect, useState } from 'react'
import type { QueueKind, QueueSnapshot, QueuedPrompt } from '@shared/queue'
import type { AppError, Result } from '@shared/types'
import { isSnapshotFor } from '@renderer/lib/queueView'

export interface PromptQueue {
  readonly running: QueuedPrompt | null
  readonly waiting: readonly QueuedPrompt[]
  readonly paused: boolean
  /** A prompt is running in this conversation, whichever pane or window sent it. */
  readonly busy: boolean
  readonly error: AppError | null
  remove: (itemId: string) => Promise<void>
  resume: () => Promise<void>
  clear: () => Promise<void>
  dismissError: () => void
}

const NOTHING_WAITING: readonly QueuedPrompt[] = []

/** The bridge itself failed (a window tearing down), as opposed to main refusing the call. */
const unreachable = (error: unknown): AppError => ({
  code: 'UNKNOWN',
  message: 'Could not reach the prompt queue.',
  detail: error instanceof Error ? error.message : String(error)
})

/**
 * One conversation's queue as the main process holds it. Only snapshots move it: a send's
 * reply says whether the prompt was queued, never what is running.
 */
export function usePromptQueue(kind: QueueKind, conversationId: number | null): PromptQueue {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  useEffect(() => {
    if (conversationId === null) return
    let active = true
    let pushed = false

    // Subscribed before the read, so a change landing between the two is never missed
    const unsubscribe = window.api.queue.onChanged((next) => {
      if (!isSnapshotFor(next, kind, conversationId)) return
      pushed = true
      setSnapshot(next)
    })

    window.api.queue
      .state(kind, conversationId)
      .then((result) => {
        // A push that arrived first is newer than this read
        if (!active || pushed) return
        if (result.ok) setSnapshot(result.data)
        else setError(result.error)
      })
      .catch((failure: unknown) => {
        if (active) setError(unreachable(failure))
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [kind, conversationId])

  // A snapshot from the conversation shown before is never read as this one's
  const current = isSnapshotFor(snapshot, kind, conversationId) ? snapshot : null

  const act = useCallback(async (call: () => Promise<Result<unknown>>): Promise<void> => {
    try {
      const result = await call()
      // The change itself arrives as a pushed snapshot; only a refusal needs handling here
      if (!result.ok) setError(result.error)
    } catch (failure) {
      setError(unreachable(failure))
    }
  }, [])

  const remove = useCallback(
    async (itemId: string): Promise<void> => {
      if (conversationId === null) return
      await act(() => window.api.queue.remove(kind, conversationId, itemId))
    },
    [act, kind, conversationId]
  )

  const resume = useCallback(async (): Promise<void> => {
    if (conversationId === null) return
    setError(null)
    await act(() => window.api.queue.resume(kind, conversationId))
  }, [act, kind, conversationId])

  const clear = useCallback(async (): Promise<void> => {
    if (conversationId === null) return
    setError(null)
    await act(() => window.api.queue.clear(kind, conversationId))
  }, [act, kind, conversationId])

  return {
    running: current?.running ?? null,
    waiting: current?.waiting ?? NOTHING_WAITING,
    paused: current?.paused ?? false,
    busy: Boolean(current?.running),
    error,
    remove,
    resume,
    clear,
    dismissError: () => setError(null)
  }
}
