import { useEffect, useState, useCallback } from 'react'
import type { SearchMode } from '@shared/search'
import type { Company, CompanyMessage, CompanyStreamEvent, AppError } from '@shared/types'

export interface PendingCompanyTurn {
  readonly memberName: string
  readonly memberRole?: string
  readonly memberColor?: string
  readonly content: string
  readonly reasoning: string
  readonly isStreaming: boolean
}

interface UseCompanyChatStream {
  readonly messages: readonly CompanyMessage[]
  readonly pending: PendingCompanyTurn | null
  readonly activeSpeaker: string | null
  readonly phaseDescription: string | null
  readonly error: AppError | null
  send: (prompt: string, searchMode?: SearchMode) => Promise<boolean>
  stop: () => Promise<void>
  dismissError: () => void
}

/** A meeting's transcript and live turn; whether one is running comes from its queue. */
export function useCompanyChatStream(
  conversationId: number | null,
  company: Company | null
): UseCompanyChatStream {
  const [messages, setMessages] = useState<readonly CompanyMessage[]>([])
  const [pending, setPending] = useState<PendingCompanyTurn | null>(null)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [phaseDescription, setPhaseDescription] = useState<string | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  const loadMessages = useCallback(async (): Promise<void> => {
    if (conversationId === null) return
    const res = await window.api.companies.listMessages(conversationId)
    if (res.ok) setMessages(res.data)
  }, [conversationId])

  useEffect(() => {
    if (conversationId === null) return
    let cancelled = false
    void window.api.companies.listMessages(conversationId).then((res) => {
      if (!cancelled && res.ok) setMessages(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    const unsubscribe = window.api.companies.onStreamEvent((event: CompanyStreamEvent) => {
      if (conversationId === null || event.conversationId !== conversationId) return

      switch (event.type) {
        case 'started': {
          // Only a meeting's end sends `error`, so a member starting means a fresh meeting
          setError(null)
          setActiveSpeaker(event.memberName)
          const member = company?.members?.find((m) => m.id === event.memberId)
          setPending({
            memberName: event.memberName,
            memberRole: member?.role,
            memberColor: member?.avatarColor ?? '#00F0FF',
            content: '',
            reasoning: '',
            isStreaming: true
          })
          break
        }

        case 'phase': {
          setPhaseDescription(event.description)
          break
        }

        case 'reasoning': {
          setPending((prev) => {
            if (!prev) return null
            return { ...prev, reasoning: prev.reasoning + event.text }
          })
          break
        }

        case 'delta': {
          setPending((prev) => {
            if (!prev) return null
            return { ...prev, content: prev.content + event.text }
          })
          break
        }

        case 'member-done': {
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.message.id)) return prev
            return [...prev, event.message]
          })
          setPending(null)
          break
        }

        // Whether a meeting is running comes from the queue snapshot; these only tidy the view
        case 'finished': {
          setActiveSpeaker(null)
          setPhaseDescription(null)
          setPending(null)
          void loadMessages()
          break
        }

        case 'error': {
          setActiveSpeaker(null)
          setPhaseDescription(null)
          setPending(null)
          setError(event.error)
          break
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [conversationId, company, loadMessages])

  /** Queues the prompt; true once the main process took it, so the composer may clear. */
  const send = useCallback(
    async (prompt: string, searchMode: SearchMode = 'off'): Promise<boolean> => {
      if (!company || conversationId === null) return false
      const res = await window.api.companies.askStream(
        company.id,
        conversationId,
        prompt,
        searchMode
      )
      if (!res.ok) setError(res.error)
      return res.ok
    },
    [company, conversationId]
  )

  const stop = useCallback(async () => {
    if (conversationId === null) return
    await window.api.companies.stopStream(conversationId)
    setActiveSpeaker(null)
    setPhaseDescription(null)
    setPending(null)
  }, [conversationId])

  return {
    messages,
    pending,
    activeSpeaker,
    phaseDescription,
    error,
    send,
    stop,
    dismissError: () => setError(null)
  }
}
