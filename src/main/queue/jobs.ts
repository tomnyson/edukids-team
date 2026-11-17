/**
 * The two kinds of queued work, and how each is shown to the renderer. Type imports only, so
 * tests load it without a bundler.
 */
import type { QueueKind, QueuedPrompt, QueueSnapshot } from '../../shared/queue'
import type { SearchMode } from '../../shared/search'
import type { EffortId, ModelId } from '../../shared/types'
import type { LaneState, QueueItem } from './queue-state'

/** A solo prompt as validated at submit; attachments are checked again when it runs. */
export interface SoloJob {
  readonly conversationId: number
  readonly prompt: string
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly attachments: readonly string[]
}

/** A meeting prompt. The company is read again when it runs, so member edits apply. */
export interface CompanyJob {
  readonly companyId: number
  readonly prompt: string
  /** Checked at submit; only a direct chat acts on it. */
  readonly searchMode: SearchMode
}

export type PromptDescription = Omit<QueuedPrompt, 'id'>

/** Paths stay in the main process; the renderer only learns how many files are attached. */
export function describeSoloJob(job: SoloJob): PromptDescription {
  return {
    prompt: job.prompt,
    model: job.model,
    effort: job.effort,
    attachmentCount: job.attachments.length
  }
}

export function describeCompanyJob(job: CompanyJob): PromptDescription {
  return { prompt: job.prompt, model: null, effort: null, attachmentCount: 0 }
}

export function toSnapshot<J>(
  kind: QueueKind,
  conversationId: number,
  lane: LaneState<J>,
  describe: (job: J) => PromptDescription
): QueueSnapshot {
  // The queue's id is spread last, so a describer can never stand in for it
  const show = (item: QueueItem<J>): QueuedPrompt => ({ ...describe(item.job), id: item.id })
  return {
    kind,
    conversationId,
    running: lane.running ? show(lane.running) : null,
    waiting: lane.waiting.map(show),
    paused: lane.paused
  }
}
