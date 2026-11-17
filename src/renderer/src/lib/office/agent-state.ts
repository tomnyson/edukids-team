import type { CompanyStreamEvent } from '@shared/types'

/**
 * What each team member is doing right now, built from the same stream events the transcript
 * uses. Pure, so the 3D scene only ever draws state and never decides it.
 */

export type AgentStatus = 'idle' | 'working' | 'done'

export interface AgentActivity {
  readonly status: AgentStatus
  /** The meeting phase of the member's current or last turn, e.g. `framing`. */
  readonly phase: string | null
  /** The tail of what the member is writing, or last wrote. */
  readonly excerpt: string
  /** When the current or last turn began, in ms. */
  readonly startedAt: number | null
}

export interface OfficeState {
  readonly agents: Readonly<Record<number, AgentActivity>>
  /** The member holding the floor; null between turns. */
  readonly activeId: number | null
}

/** How much of a streaming reply the detail panel keeps. */
export const EXCERPT_MAX = 600

const IDLE: AgentActivity = { status: 'idle', phase: null, excerpt: '', startedAt: null }

export const EMPTY_OFFICE: OfficeState = { agents: {}, activeId: null }

export const activityOf = (state: OfficeState, memberId: number): AgentActivity =>
  state.agents[memberId] ?? IDLE

export const workingAgents = (state: OfficeState): readonly number[] =>
  Object.entries(state.agents)
    .filter(([, activity]) => activity.status === 'working')
    .map(([id]) => Number(id))

/**
 * Thinking is the wait before the reply: from the start of a turn until its first text arrives,
 * reasoning included. It holds for every model, whether or not it streams its reasoning.
 */
export const isThinking = (activity: AgentActivity): boolean =>
  activity.status === 'working' && activity.excerpt === ''

/** The floating tag over a member's head. */
export function statusLabel(activity: AgentActivity): string {
  if (activity.status === 'working') {
    return activity.phase ? `WORKING · ${activity.phase}` : 'WORKING'
  }
  return activity.status === 'done' ? 'DONE' : 'IDLE'
}

function withAgent(
  state: OfficeState,
  memberId: number,
  patch: Partial<AgentActivity>
): OfficeState {
  return {
    ...state,
    agents: { ...state.agents, [memberId]: { ...activityOf(state, memberId), ...patch } }
  }
}

/** Everybody back to idle, keeping what each last said. */
function atRest(state: OfficeState): OfficeState {
  const agents = Object.fromEntries(
    Object.entries(state.agents).map(([id, activity]) => [id, { ...activity, status: 'idle' }])
  ) as Record<number, AgentActivity>
  return { agents, activeId: null }
}

export function applyOfficeEvent(
  state: OfficeState,
  event: CompanyStreamEvent,
  now: number
): OfficeState {
  switch (event.type) {
    case 'started': {
      if (event.memberId === null) return state
      const next = withAgent(state, event.memberId, {
        status: 'working',
        phase: null,
        excerpt: '',
        startedAt: now
      })
      return { ...next, activeId: event.memberId }
    }
    // The phase is announced right after its member starts; with nobody active it is work
    // between turns, which belongs to no desk
    case 'phase':
      return state.activeId === null
        ? state
        : withAgent(state, state.activeId, { phase: event.phase })
    case 'delta': {
      if (event.memberId === null) return state
      const excerpt = (activityOf(state, event.memberId).excerpt + event.text).slice(-EXCERPT_MAX)
      return withAgent(state, event.memberId, { excerpt })
    }
    case 'member-done': {
      if (event.memberId === null) return state
      const next = withAgent(state, event.memberId, { status: 'done' })
      return { ...next, activeId: state.activeId === event.memberId ? null : state.activeId }
    }
    case 'finished':
    case 'error':
      return atRest(state)
    default:
      return state
  }
}
