import { useCallback, useEffect, useState } from 'react'
import type { MemberProposal, ProposalDraft } from '@shared/proposals'
import type { AppError } from '@shared/types'

interface UseProposals {
  readonly proposals: readonly MemberProposal[]
  /** Resolves to the error to show, or null when the member was added. */
  approve: (id: number, draft: ProposalDraft) => Promise<AppError | null>
  reject: (id: number) => Promise<AppError | null>
}

const replace = (
  list: readonly MemberProposal[],
  next: MemberProposal
): readonly MemberProposal[] =>
  list.some((item) => item.id === next.id)
    ? list.map((item) => (item.id === next.id ? next : item))
    : [...list, next]

/** The new members the CEO proposed in one meeting, and the user's decision on each. */
export function useProposals(
  conversationId: number | null,
  onTeamChanged: () => void
): UseProposals {
  const [proposals, setProposals] = useState<readonly MemberProposal[]>([])

  useEffect(() => {
    if (conversationId === null) return
    let cancelled = false
    void window.api.proposals.list(conversationId).then((result) => {
      if (!cancelled && result.ok) setProposals(result.data)
    })
    const unsubscribe = window.api.companies.onStreamEvent((event) => {
      if (event.type !== 'proposal' || event.conversationId !== conversationId) return
      setProposals((current) => replace(current, event.proposal))
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [conversationId])

  const approve = useCallback(
    async (id: number, draft: ProposalDraft): Promise<AppError | null> => {
      const result = await window.api.proposals.approve(id, draft)
      if (!result.ok) return result.error
      setProposals((current) => replace(current, result.data))
      // The team list feeds @mentions and the next run, so it is reloaded at once
      onTeamChanged()
      return null
    },
    [onTeamChanged]
  )

  const reject = useCallback(async (id: number): Promise<AppError | null> => {
    const result = await window.api.proposals.reject(id)
    if (!result.ok) return result.error
    setProposals((current) => replace(current, result.data))
    return null
  }, [])

  return { proposals, approve, reject }
}
