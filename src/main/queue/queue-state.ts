/**
 * One conversation's prompt queue as plain data. Every transition returns a new lane and never
 * touches the one it was given. Relative value imports only, so tests load it without a bundler.
 */
import { MAX_QUEUED } from '../../shared/queue'

export interface QueueItem<J> {
  readonly id: string
  readonly job: J
}

export interface LaneState<J> {
  readonly running: QueueItem<J> | null
  readonly waiting: readonly QueueItem<J>[]
  /** Holds the waiting prompts back. Never true while nothing waits. */
  readonly paused: boolean
}

/** How a run ended. Prompts that never ran are not runs and have no outcome here. */
export type RunOutcome = 'done' | 'failed' | 'stopped'

export function emptyLane<J>(): LaneState<J> {
  return { running: null, waiting: [], paused: false }
}

/** Keeps the one invariant: a pause with nothing to hold back is no pause. */
function settle<J>(lane: LaneState<J>): LaneState<J> {
  return lane.paused && lane.waiting.length === 0 ? { ...lane, paused: false } : lane
}

/** Appends to the end, or null when the lane already holds `max` waiting prompts. */
export function enqueue<J>(
  lane: LaneState<J>,
  item: QueueItem<J>,
  max: number = MAX_QUEUED
): LaneState<J> | null {
  if (lane.waiting.length >= max) return null
  return { ...lane, waiting: [...lane.waiting, item] }
}

/** Moves the head into `running`, or null when something runs, nothing waits, or it is paused. */
export function startNext<J>(
  lane: LaneState<J>
): { readonly lane: LaneState<J>; readonly item: QueueItem<J> } | null {
  if (lane.running || lane.paused || lane.waiting.length === 0) return null
  const [item, ...rest] = lane.waiting
  return { lane: { ...lane, running: item, waiting: rest }, item }
}

/**
 * Clears `running`. A failure pauses what waits, so one broken run does not burn through the
 * queue. A stop pauses nothing by itself: the stop that caused it already paused the lane.
 */
export function finish<J>(lane: LaneState<J>, outcome: RunOutcome): LaneState<J> {
  return settle({ ...lane, running: null, paused: lane.paused || outcome === 'failed' })
}

export function pause<J>(lane: LaneState<J>): LaneState<J> {
  return settle({ ...lane, paused: true })
}

export function resume<J>(lane: LaneState<J>): LaneState<J> {
  return lane.paused ? { ...lane, paused: false } : lane
}

/** Takes one waiting prompt out. The running prompt is stopped, never removed. */
export function remove<J>(
  lane: LaneState<J>,
  id: string
): { readonly lane: LaneState<J>; readonly removed: QueueItem<J> | null } {
  const removed = lane.waiting.find((entry) => entry.id === id) ?? null
  if (!removed) return { lane, removed: null }
  const waiting = lane.waiting.filter((entry) => entry.id !== id)
  return { lane: settle({ ...lane, waiting }), removed }
}

/** Empties the waiting list and lifts the pause; the running prompt is left alone. */
export function clear<J>(lane: LaneState<J>): {
  readonly lane: LaneState<J>
  readonly removed: readonly QueueItem<J>[]
} {
  return { lane: { ...lane, waiting: [], paused: false }, removed: lane.waiting }
}

export function isIdle<J>(lane: LaneState<J>): boolean {
  return lane.running === null && lane.waiting.length === 0
}
