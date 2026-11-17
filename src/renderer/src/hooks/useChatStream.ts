import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppError, Message, StreamEvent } from '@shared/types'
import {
  nextPending,
  startedTurn,
  withMessage,
  type PendingTurn,
  type SendOptions
} from '@renderer/lib/queueView'

export type { PendingTurn, SendOptions }

interface UseChatStream {
  readonly messages: readonly Message[]
  readonly pending: PendingTurn | null
  readonly error: AppError | null
  /** The prompt whose run ended in `error`, so retry knows what to send again. */
  readonly failedPrompt: string | null
  /** Queues the prompt; true once the main process took it, so the composer may clear. */
  submit: (prompt: string, options: SendOptions) => Promise<boolean>
  cancel: () => Promise<void>
  dismissError: () => void
}

/**
 * Owns the transcript for one conversation. The turn on screen follows the run's own events:
 * `started` opens it, deltas fill it, `settled` swaps in the row the main process stored. A
 * prompt sent while another runs only joins the queue, so sending never draws a turn itself.
 *
 * The caller keys this hook's component by conversation id, so switching
 * conversations remounts rather than resetting state by hand.
 */
export function useChatStream(conversationId: number | null, onSettled: () => void): UseChatStream {
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null)

  // Read from inside the stream listener without resubscribing on every render
  const onSettledRef = useRef(onSettled)
  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

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
    if (conversationId === null) return
    let active = true
    let heard = false
    // The running prompt's text, so a failure names what retry should send again
    let runningPrompt: string | null = null

    const reload = async (): Promise<void> => {
      const refreshed = await window.api.listMessages(conversationId)
      if (active && refreshed.ok) setMessages(refreshed.data)
    }

    const settle = (message: Message | null, failure: AppError | null): void => {
      if (failure) {
        setError(failure)
        setFailedPrompt(runningPrompt)
        // The stored row, if any, is read back rather than trusted from the event
        void reload()
      } else if (message) {
        setMessages((current) => withMessage(current, message))
      }
      runningPrompt = null
      onSettledRef.current()
    }

    const unsubscribe = window.api.onStream((event: StreamEvent) => {
      if (event.conversationId !== conversationId) return
      heard = true
      setPending((current) => nextPending(current, event))
      if (event.type === 'started') {
        runningPrompt = event.prompt
        // A new run starts clean; the last one's error no longer describes what is on screen
        setError(null)
        setFailedPrompt(null)
      } else if (event.type === 'settled') {
        settle(event.message, event.error)
      }
    })

    // A run that started before this pane mounted: show its prompt and stream from here on
    void window.api.queue.state('solo', conversationId).then((result) => {
      if (!active || heard || !result.ok || !result.data.running) return
      runningPrompt = result.data.running.prompt
      setPending(startedTurn(result.data.running.prompt))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [conversationId])

  const submit = useCallback(
    async (prompt: string, options: SendOptions): Promise<boolean> => {
      const trimmed = prompt.trim()
      if (conversationId === null || !trimmed) return false

      const result = await window.api.queue.submit({
        conversationId,
        prompt: trimmed,
        model: options.model,
        effort: options.effort,
        attachments: options.attachments
      })
      if (result.ok) return true
      // A refusal is about this send, not a run, so there is nothing to retry
      setError(result.error)
      setFailedPrompt(null)
      return false
    },
    [conversationId]
  )

  const cancel = useCallback(async (): Promise<void> => {
    if (conversationId !== null) await window.api.cancel(conversationId)
  }, [conversationId])

  const dismissError = useCallback((): void => {
    setError(null)
    setFailedPrompt(null)
  }, [])

  return { messages, pending, error, failedPrompt, submit, cancel, dismissError }
}
