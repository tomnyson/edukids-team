/**
 * Runs each conversation's queued prompts one at a time. No electron here: the run itself and
 * the change listener are passed in, so tests drive every run by hand.
 */
import {
  clear,
  emptyLane,
  enqueue,
  finish,
  isIdle,
  pause,
  remove,
  resume,
  startNext,
  type LaneState,
  type QueueItem,
  type RunOutcome
} from './queue-state'

/** What a run reports. `failed` pauses the prompts behind it. */
export interface RunReport<R> {
  readonly failed: boolean
  readonly value: R
}

/** How a submitted prompt ended. `cancelled` means it was taken out before it ran. */
export interface Settled<R> {
  readonly outcome: RunOutcome | 'cancelled'
  /** What the run reported; null when it never ran or threw. */
  readonly value: R | null
  /** Present only when the run threw. */
  readonly error?: unknown
}

export type SubmitResult<J, R> =
  | { readonly ok: true; readonly item: QueueItem<J>; readonly settled: Promise<Settled<R>> }
  | { readonly ok: false; readonly reason: 'full' | 'closed' }

export interface QueueRunnerOptions<J, R> {
  readonly run: (key: number, job: J, signal: AbortSignal) => Promise<RunReport<R>>
  readonly onChange: (key: number, lane: LaneState<J>) => void
  readonly maxQueued?: number
}

export interface QueueRunner<J, R> {
  submit(key: number, job: J): SubmitResult<J, R>
  /** Takes a waiting prompt out; false for the running one or an unknown id. */
  remove(key: number, id: string): boolean
  resume(key: number): void
  clear(key: number): void
  /** Pauses what waits, then aborts what runs. True when something was running. */
  stop(key: number): boolean
  /** The conversation is gone: cancels what waits and aborts what runs. */
  drop(key: number): void
  /** For quit: refuses new prompts, cancels every waiting one, aborts every run. */
  freezeAll(): void
  lane(key: number): LaneState<J>
  activeKeys(): readonly number[]
}

/** An aborted run is a stop whatever it reported, so a stop never pauses as a failure. */
export function classifyRun(aborted: boolean, failed: boolean): RunOutcome {
  if (aborted) return 'stopped'
  return failed ? 'failed' : 'done'
}

/** A prompt that did run always has a run outcome. */
type RanSettled<R> = Settled<R> & { readonly outcome: RunOutcome }

const CANCELLED = { outcome: 'cancelled', value: null } as const

export function createQueueRunner<J, R>(options: QueueRunnerOptions<J, R>): QueueRunner<J, R> {
  const { run, onChange, maxQueued } = options
  const lanes = new Map<number, LaneState<J>>()
  const controllers = new Map<number, AbortController>()
  const waiters = new Map<string, (settled: Settled<R>) => void>()
  let closed = false
  let counter = 0

  const laneOf = (key: number): LaneState<J> => lanes.get(key) ?? emptyLane<J>()

  const resolveItem = (id: string, settled: Settled<R>): void => {
    waiters.get(id)?.(settled)
    waiters.delete(id)
  }

  const commit = (key: number, lane: LaneState<J>): void => {
    if (isIdle(lane)) lanes.delete(key)
    else lanes.set(key, lane)
    onChange(key, lane)
  }

  async function runOnce(key: number, job: J, signal: AbortSignal): Promise<RanSettled<R>> {
    try {
      const report = await run(key, job, signal)
      return { outcome: classifyRun(signal.aborted, report.failed), value: report.value }
    } catch (error) {
      return { outcome: classifyRun(signal.aborted, true), value: null, error }
    }
  }

  async function launch(key: number, item: QueueItem<J>): Promise<void> {
    const controller = new AbortController()
    controllers.set(key, controller)
    const settled = await runOnce(key, item.job, controller.signal)
    if (controllers.get(key) === controller) controllers.delete(key)
    // Commit before resolving, so a waiter that reads the lane sees the run as over
    advance(key, finish(laneOf(key), settled.outcome))
    resolveItem(item.id, settled)
  }

  /** Commits the lane after starting its next prompt when it can. */
  function advance(key: number, lane: LaneState<J>): void {
    const next = closed ? null : startNext(lane)
    commit(key, next ? next.lane : lane)
    if (next) void launch(key, next.item)
  }

  function cancelWaiting(key: number): void {
    const lane = lanes.get(key)
    if (!lane) return
    const cleared = clear(lane)
    commit(key, cleared.lane)
    for (const item of cleared.removed) resolveItem(item.id, CANCELLED)
  }

  return {
    submit(key, job) {
      if (closed) return { ok: false, reason: 'closed' }
      counter += 1
      const item: QueueItem<J> = { id: `q${counter}`, job }
      const lane = enqueue(laneOf(key), item, maxQueued)
      if (!lane) return { ok: false, reason: 'full' }
      const settled = new Promise<Settled<R>>((resolve) => waiters.set(item.id, resolve))
      advance(key, lane)
      return { ok: true, item, settled }
    },

    remove(key, id) {
      const lane = lanes.get(key)
      if (!lane) return false
      const result = remove(lane, id)
      if (!result.removed) return false
      commit(key, result.lane)
      resolveItem(id, CANCELLED)
      return true
    },

    resume(key) {
      const lane = lanes.get(key)
      if (lane) advance(key, resume(lane))
    },

    clear: cancelWaiting,

    stop(key) {
      const lane = lanes.get(key)
      if (lane) commit(key, pause(lane))
      // Paused first: an abort that settles at once must not find the next prompt free to start
      const controller = controllers.get(key)
      controller?.abort()
      return controller !== undefined
    },

    drop(key) {
      cancelWaiting(key)
      controllers.get(key)?.abort()
    },

    freezeAll() {
      closed = true
      for (const key of [...lanes.keys()]) cancelWaiting(key)
      for (const controller of controllers.values()) controller.abort()
    },

    lane: laneOf,
    activeKeys: () => [...lanes.keys()]
  }
}
