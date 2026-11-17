/**
 * Company meetings: each conversation runs its prompts one at a time, in the order they were
 * sent. A meeting's progress reaches the renderer as stream events; whether one is running, and
 * what waits, comes from the queue snapshot.
 */
import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { COMPANY_CHANNELS, LIMITS } from '@shared/ipc'
import { isConversationId, type QueuedPrompt } from '@shared/queue'
import { isSearchMode } from '@shared/search'
import type { AppError, CompanyStreamEvent, Result } from '@shared/types'
import { findCompany } from '../db/companies'
import { findProject } from '../db/projects'
import { findConversation } from '../db/queries'
import { runCompanyOrchestration } from '../orchestrator'
import { resolveMeetingFolder } from '../orchestrator/meeting-folder'
import { describeCompanyJob, type CompanyJob } from '../queue/jobs'
import { createQueueRunner, type RunReport } from '../queue/runner'
import { refusalError } from '../queue/solo-ask'
import { push, type WindowGetter } from './push'
import { pushSnapshots, queueControls } from './queue'
import { fail, ok } from './result'

let getWindow: WindowGetter = () => null

const emit = (event: CompanyStreamEvent): void =>
  push(getWindow, COMPANY_CHANNELS.streamEvent, event)

/**
 * The folder a meeting writes code into: its project's, read from the DB. A project folder that
 * is gone fails the turn rather than sending the executor somewhere else.
 */
async function prepareMeetingFolder(conversationId: number): Promise<Result<string>> {
  const conversation = findConversation(conversationId)
  if (!conversation) return fail({ code: 'NOT_FOUND', message: 'Conversation not found' })

  const project = conversation.projectId ? findProject(conversation.projectId) : null
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const folder = resolveMeetingFolder({
    projectPath: project?.path ?? null,
    conversationId,
    home: homedir(),
    workspacesRoot
  })

  // Only the meeting's own folder is created; a missing project folder is never recreated empty
  if (folder === join(workspacesRoot, String(conversationId))) {
    await mkdir(folder, { recursive: true })
  } else if (!existsSync(folder)) {
    return fail({ code: 'NOT_FOUND', message: `The project folder ${folder} no longer exists.` })
  }
  return ok(folder)
}

const failed = (conversationId: number, error: AppError): RunReport<null> => {
  emit({ type: 'error', conversationId, error })
  return { failed: true, value: null }
}

async function runCompanyJob(
  conversationId: number,
  job: CompanyJob,
  signal: AbortSignal
): Promise<RunReport<null>> {
  // Read at run time, so member edits made while this prompt waited apply to it
  const company = findCompany(job.companyId)
  if (!company) return failed(conversationId, { code: 'NOT_FOUND', message: 'Company not found' })

  const folder = await prepareMeetingFolder(conversationId)
  if (!folder.ok) return failed(conversationId, folder.error)

  try {
    await runCompanyOrchestration({
      company,
      conversationId,
      userPrompt: job.prompt,
      searchMode: job.searchMode,
      folder: folder.data,
      signal,
      onEvent: emit
    })
    return { failed: false, value: null }
  } catch (error) {
    // A stop is not a failure to report: the runner counts it as stopped either way
    if (signal.aborted) return { failed: true, value: null }
    const message = error instanceof Error ? error.message : String(error)
    return failed(conversationId, { code: 'CLI_ERROR', message })
  }
}

const companyRunner = createQueueRunner<CompanyJob, null>({
  run: runCompanyJob,
  onChange: pushSnapshots('company', describeCompanyJob, () => getWindow())
})

export const companyQueueControls = queueControls('company', companyRunner, describeCompanyJob)

const invalid = (message: string): Result<never> => fail({ code: 'INVALID_INPUT', message })

// A company id is checked like a conversation id: a positive integer from the renderer
const isPositiveInteger = isConversationId

/** Queues a meeting prompt; the meeting itself streams its events as it runs. */
export function submitCompanyPrompt(
  companyId: unknown,
  conversationId: unknown,
  rawPrompt: unknown,
  rawSearchMode?: unknown
): Result<QueuedPrompt> {
  if (!isPositiveInteger(companyId) || !isConversationId(conversationId)) {
    return invalid('That meeting is not valid.')
  }
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : ''
  if (!prompt) return invalid('Type something first.')
  if (prompt.length > LIMITS.promptMaxLength) {
    return invalid(
      `That prompt is too long (limit ${LIMITS.promptMaxLength.toLocaleString()} characters).`
    )
  }
  if (!findCompany(companyId)) return fail({ code: 'NOT_FOUND', message: 'Company not found' })
  if (!findConversation(conversationId)) {
    return fail({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  // Left out by older callers; anything else that is not a mode is refused rather than guessed
  if (rawSearchMode !== undefined && !isSearchMode(rawSearchMode)) {
    return invalid('That search mode is not valid.')
  }
  const searchMode = isSearchMode(rawSearchMode) ? rawSearchMode : 'off'

  const job: CompanyJob = { companyId, prompt, searchMode }
  const submitted = companyRunner.submit(conversationId, job)
  if (!submitted.ok) return fail(refusalError(submitted.reason))
  return ok({ ...describeCompanyJob(job), id: submitted.item.id })
}

export function setCompanyQueueWindow(windowGetter: WindowGetter): void {
  getWindow = windowGetter
}

/** Stops the running meeting and holds the prompts behind it until resumed. */
export const stopCompanyRun = (conversationId: number): boolean =>
  companyRunner.stop(conversationId)

/** The conversation was deleted: nothing of its queue may run. */
export const dropCompanyQueue = (conversationId: number): void => companyRunner.drop(conversationId)

/** For quit: no new prompts, nothing left waiting, every meeting aborted. */
export const freezeCompanyQueue = (): void => companyRunner.freezeAll()
