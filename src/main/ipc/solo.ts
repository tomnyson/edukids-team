/**
 * Solo chats: each conversation runs its prompts one at a time, in the order they were sent.
 * `ask` waits for its prompt's turn and resolves with the stored reply; `queue:submit` returns
 * as soon as the prompt is queued. Both share one queue per conversation.
 */
import { ipcMain } from 'electron'
import { IPC, QUEUE_CHANNELS } from '@shared/ipc'
import { isConversationId, type QueuedPrompt } from '@shared/queue'
import type { AppError, AskResult, Message, Result, StreamEvent } from '@shared/types'
import { composePrompt, validateAttachments } from '../claude/attachments'
import { runClaude } from '../claude/runner'
import { findConversation, insertHistory, markSessionStarted } from '../db/queries'
import { describeSoloJob, type SoloJob } from '../queue/jobs'
import { createQueueRunner, type RunReport, type Settled } from '../queue/runner'
import { checkSoloFields, refusalError, resultFromSettled } from '../queue/solo-ask'
import { push, type WindowGetter } from './push'
import { pushSnapshots, queueControls } from './queue'
import { fail, guard, ok } from './result'

type AskOutcome = Result<AskResult>

/** One finished turn: what `ask` resolves with, and the row the transcript gains. */
interface Turn {
  readonly result: AskOutcome
  readonly message: Message | null
  readonly failed: boolean
}

interface Queued {
  readonly prompt: QueuedPrompt
  readonly settled: Promise<Settled<AskOutcome>>
}

let getWindow: WindowGetter = () => null

const emit = (event: StreamEvent): void => push(getWindow, IPC.claudeStream, event)

const gone = (message: string): AppError => ({ code: 'NOT_FOUND', message })

const formatError = (error: AppError): string =>
  error.detail ? `${error.message}\n\n${error.detail}` : error.message

const refused = (error: AppError): Turn => ({ result: fail(error), message: null, failed: true })

async function runTurn(job: SoloJob, signal: AbortSignal): Promise<Turn> {
  const { conversationId, model, effort } = job
  // Checked again: a queued prompt can wait long enough for a file or the chat to go
  const attachments = validateAttachments(job.attachments)
  if (!attachments.ok) return refused(attachments.error)
  // Read at run time, so a prompt queued behind the first resumes the session it started
  const conversation = findConversation(conversationId)
  if (!conversation) return refused(gone('That conversation no longer exists.'))

  const composed = composePrompt(job.prompt, attachments.paths)
  const outcome = await runClaude({
    prompt: composed.prompt,
    sessionId: conversation.sessionId,
    resume: conversation.sessionStarted,
    cwd: conversation.cwd,
    model,
    effort,
    addDirs: composed.addDirs,
    signal,
    onDelta: (text) => emit({ type: 'delta', conversationId, text }),
    onTool: (name) => emit({ type: 'tool', conversationId, name })
  })

  // A run stopped or refused before the CLI started created no session to resume
  if (outcome.spawned && !conversation.sessionStarted) markSessionStarted(conversationId)

  const message = insertHistory({
    conversationId,
    // Stored as sent, so the transcript shows the @mentions that ran
    prompt: composed.prompt,
    response: outcome.text,
    model,
    effort,
    error: outcome.error ? formatError(outcome.error) : null,
    durationMs: outcome.durationMs,
    costUsd: outcome.costUsd
  })

  const refreshed = findConversation(conversationId)
  if (!refreshed) return refused(gone('That conversation was deleted mid-run.'))

  // A reply cut short still counts as failed, so the prompts behind it wait
  const failed = Boolean(outcome.error)
  if (outcome.error && !outcome.text) return { result: fail(outcome.error), message, failed }
  return { result: ok({ message, conversation: refreshed }), message, failed }
}

function crashed(error: unknown): Turn {
  const detail = error instanceof Error ? error.message : String(error)
  console.error('[ipc:solo] run failed:', detail)
  return refused({ code: 'UNKNOWN', message: 'Something went wrong inside the app.', detail })
}

/** Every run sends `started` then `settled`, so the renderer can draw a turn it did not send. */
async function runSoloJob(job: SoloJob, signal: AbortSignal): Promise<RunReport<AskOutcome>> {
  const { conversationId } = job
  emit({ type: 'started', conversationId, prompt: job.prompt })
  const turn = await runTurn(job, signal).catch(crashed)
  const error = turn.result.ok ? null : turn.result.error
  emit({ type: 'settled', conversationId, message: turn.message, error })
  return { failed: turn.failed, value: turn.result }
}

const soloRunner = createQueueRunner<SoloJob, AskOutcome>({
  run: (_conversationId, job, signal) => runSoloJob(job, signal),
  onChange: pushSnapshots('solo', describeSoloJob, () => getWindow())
})

export const soloQueueControls = queueControls('solo', soloRunner, describeSoloJob)

/** Checks the request as `ask` always has, then queues it behind the conversation's others. */
function submitSolo(request: unknown): Result<Queued> {
  const fields = checkSoloFields(request)
  if (!fields.ok) return fields

  const attachments = validateAttachments((request as { attachments?: unknown }).attachments)
  if (!attachments.ok) return fail(attachments.error)
  if (!findConversation(fields.data.conversationId)) {
    return fail(gone('That conversation no longer exists.'))
  }

  const job: SoloJob = { ...fields.data, attachments: attachments.paths }
  const submitted = soloRunner.submit(job.conversationId, job)
  if (!submitted.ok) return fail(refusalError(submitted.reason))
  return ok({
    prompt: { ...describeSoloJob(job), id: submitted.item.id },
    settled: submitted.settled
  })
}

export function registerSoloIpcHandlers(windowGetter: WindowGetter): void {
  getWindow = windowGetter

  ipcMain.handle(
    IPC.claudeAsk,
    guard('solo', async (_event, request: unknown) => {
      const queued = submitSolo(request)
      if (!queued.ok) return queued
      return resultFromSettled(await queued.data.settled)
    })
  )

  ipcMain.handle(
    QUEUE_CHANNELS.submit,
    guard('solo', (_event, request: unknown) => {
      const queued = submitSolo(request)
      return queued.ok ? ok(queued.data.prompt) : queued
    })
  )

  /** Stops the running prompt and holds the ones behind it until resumed. */
  ipcMain.handle(
    IPC.claudeCancel,
    guard('solo', (_event, id: unknown) =>
      isConversationId(id)
        ? ok(soloRunner.stop(id))
        : fail({ code: 'INVALID_INPUT', message: 'That conversation id is not valid.' })
    )
  )
}

/** The conversation was deleted: nothing of its queue may run. */
export const dropSoloQueue = (conversationId: number): void => soloRunner.drop(conversationId)

/** For quit: no new prompts, nothing left waiting, every run aborted. */
export const freezeSoloQueue = (): void => soloRunner.freezeAll()
