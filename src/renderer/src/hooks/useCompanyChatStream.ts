import { useEffect, useState, useCallback, useRef } from 'react'
import type { Company, CompanyMessage, CompanyStreamEvent, AppError } from '@shared/types'

export interface PendingCompanyTurn {
  readonly memberName: string
  readonly memberRole?: string
  readonly memberColor?: string
  readonly content: string
  readonly reasoning: string
  readonly isStreaming: boolean
}

export function useCompanyChatStream(
  conversationId: number | null,
  company: Company | null
) {
  const [messages, setMessages] = useState<readonly CompanyMessage[]>([])
  const [pending, setPending] = useState<PendingCompanyTurn | null>(null)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [phaseDescription, setPhaseDescription] = useState<string | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [busy, setBusy] = useState(false)

  const loadMessages = useCallback(async () => {
    if (conversationId === null) {
      setMessages([])
      return
    }
    const res = await window.api.companies.listMessages(conversationId)
    if (res.ok) {
      setMessages(res.data)
    }
  }, [conversationId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Handle stream events
  const pendingRef = useRef<PendingCompanyTurn | null>(null)
  pendingRef.current = pending

  useEffect(() => {
    const unsubscribe = window.api.companies.onStreamEvent((event: CompanyStreamEvent) => {
      if (conversationId === null || event.conversationId !== conversationId) return

      switch (event.type) {
        case 'started': {
          setBusy(true)
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

        case 'finished': {
          setBusy(false)
          setActiveSpeaker(null)
          setPhaseDescription(null)
          setPending(null)
          loadMessages()
          break
        }

        case 'error': {
          setBusy(false)
          setActiveSpeaker(null)
          setPhaseDescription(null)
          setError(event.error)
          break
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [conversationId, company, loadMessages])

  const send = useCallback(
    async (prompt: string) => {
      if (!company || conversationId === null) return
      setError(null)
      setBusy(true)
      const res = await window.api.companies.askStream(company.id, conversationId, prompt)
      if (!res.ok) {
        setError(res.error)
        setBusy(false)
      }
    },
    [company, conversationId]
  )

  const stop = useCallback(async () => {
    if (conversationId === null) return
    await window.api.companies.stopStream(conversationId)
    setBusy(false)
    setActiveSpeaker(null)
    setPhaseDescription(null)
    setPending(null)
  }, [conversationId])

  return {
    messages,
    pending,
    activeSpeaker,
    phaseDescription,
    busy,
    error,
    send,
    stop,
    dismissError: () => setError(null)
  }
}
