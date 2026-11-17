import { useEffect, useState } from 'react'
import { applyOfficeEvent, EMPTY_OFFICE, type OfficeState } from '@renderer/lib/office/agent-state'

/** What each member of one meeting is doing, from the same events the transcript listens to. */
export function useOfficeState(conversationId: number | null): OfficeState {
  const [state, setState] = useState<OfficeState>(EMPTY_OFFICE)

  useEffect(() => {
    if (conversationId === null) return
    return window.api.companies.onStreamEvent((event) => {
      if (event.conversationId !== conversationId) return
      setState((current) => applyOfficeEvent(current, event, Date.now()))
    })
  }, [conversationId])

  return state
}
