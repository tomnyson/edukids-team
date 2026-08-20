import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppError, EffortId, Message, ModelId, StreamEvent } from '@shared/types'

/** A turn that is still running: the prompt is known, the answer is arriving. */
export interface PendingTurn {
  readonly prompt: string
  readonly streamed: string
  readonly activeTool: string | null
}

/** What the composer had staged when the turn was sent. */
export interface SendOptions {
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly attachments: readonly string[]
}

interface UseChatStream {
  readonly messages: readonly Message[]
  readonly pending: PendingTurn | null
  readonly loading: boolean
  readonly error: AppError | null
  send: (prompt: string, options: SendOptions) => Promise<void>
  cancel: () => Promise<void>
  dismissError: () => void
}

/**
 * Owns the transcript for one conversation. Live deltas render as a pending
 * turn; once the run settles, the row persisted by the main process replaces it.
 *
 * The caller keys this hook's component by conversation id, so switching
 * conversations remounts rather than resetting state by hand.
 */
export function useChatStream(conversationId: number | null, onSettled: () => void): UseChatStream {
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // A run can outlive the pane; this keeps late resolutions from writing back.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (conversationId === null) return

    let cancelled = false
    void window.api.listMessages(conversationId).then((result) => {
      if (cancelled) return
      if (result.ok) setMessages(result.data)
      else setError(result.error)
    })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    return window.api.onStream((event: StreamEvent) => {
      if (event.conversationId !== conversationId) return

      setPending((current) => {
        if (!current) return current
        if (event.type === 'delta') return { ...current, streamed: current.streamed + event.text }
        if (event.type === 'tool') return { ...current, activeTool: event.name }
        return current
      })
    })
  }, [conversationId])

  const send = useCallback(
    async (prompt: string, options: SendOptions): Promise<void> => {
      const trimmed = prompt.trim()
      if (conversationId === null || !trimmed || loading) return

      setError(null)
      setLoading(true)
      setPending({ prompt: trimmed, streamed: '', activeTool: null })

      const result = await window.api.ask({
        conversationId,
        prompt: trimmed,
        model: options.model,
        effort: options.effort,
        attachments: options.attachments
      })
      if (!alive.current) return

      if (result.ok) {
        setMessages((current) => [...current, result.data.message])
      } else {
        setError(result.error)
        const refreshed = await window.api.listMessages(conversationId)
        if (!alive.current) return
        if (refreshed.ok) setMessages(refreshed.data)
      }

      setPending(null)
      setLoading(false)
      onSettled()
    },
    [conversationId, loading, onSettled]
  )

  const cancel = useCallback(async (): Promise<void> => {
    if (conversationId !== null) await window.api.cancel(conversationId)
  }, [conversationId])

  return { messages, pending, loading, error, send, cancel, dismissError: () => setError(null) }
}
