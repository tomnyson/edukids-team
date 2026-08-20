import { useCallback, useEffect, useState } from 'react'
import type { Conversation } from '@shared/types'

interface UseConversations {
  readonly conversations: readonly Conversation[]
  readonly activeId: number | null
  readonly loading: boolean
  readonly error: string | null
  select: (id: number) => void
  refresh: () => Promise<readonly Conversation[]>
  create: (projectId?: number | null) => Promise<Conversation | null>
  remove: (id: number) => Promise<void>
  rename: (id: number, title: string) => Promise<void>
}

/** Owns the conversation list and which one is open. */
export function useConversations(): UseConversations {
  const [conversations, setConversations] = useState<readonly Conversation[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<readonly Conversation[]> => {
    const result = await window.api.listConversations()
    if (!result.ok) {
      setError(result.error.message)
      return []
    }
    setError(null)
    setConversations(result.data)
    return result.data
  }, [])

  const create = useCallback(
    async (projectId?: number | null): Promise<Conversation | null> => {
      const result = await window.api.createConversation({ projectId: projectId ?? null })
      if (!result.ok) {
        setError(result.error.message)
        return null
      }
      await refresh()
      setActiveId(result.data.id)
      return result.data
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number): Promise<void> => {
      const result = await window.api.deleteConversation(id)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const remaining = await refresh()
      setActiveId((current) => (current === id ? (remaining[0]?.id ?? null) : current))
    },
    [refresh]
  )

  const rename = useCallback(
    async (id: number, title: string): Promise<void> => {
      const result = await window.api.renameConversation(id, title)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      await refresh()
    },
    [refresh]
  )

  // On first paint, open the most recent conversation, or start one.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const existing = await refresh()
      if (cancelled) return

      if (existing.length > 0) {
        setActiveId(existing[0].id)
      } else {
        const created = await window.api.createConversation()
        if (cancelled) return
        if (created.ok) {
          setActiveId(created.data.id)
          await refresh()
        }
      }
      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [refresh])

  return {
    conversations,
    activeId,
    loading,
    error,
    select: setActiveId,
    refresh,
    create,
    remove,
    rename
  }
}
