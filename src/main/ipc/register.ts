import { dialog, ipcMain, type BrowserWindow } from 'electron'
// app.getVersion() reports Electron's own version until the app is packaged.
import { version as appVersion } from '../../../package.json'
import { IPC, LIMITS } from '@shared/ipc'
import type {
  AppError,
  AskRequest,
  AskResult,
  Conversation,
  CreateConversationInput,
  Message,
  Result,
  StreamEvent
} from '@shared/types'
import { isEffortId, isModelId } from '@shared/types'
import {
  createConversation,
  deleteConversation,
  findConversation,
  insertHistory,
  listConversations,
  listMessages,
  markSessionStarted,
  renameConversation
} from '../db/queries'
import { resolveClaudeBinary } from '../claude/environment'
import { runClaude } from '../claude/runner'
import { composePrompt, validateAttachments } from '../claude/attachments'
import { openFile } from '../files/open'
import {
  getSettingsView,
  openSettingsFile,
  setVoiceApiKey,
  updateSettings
} from '../settings/store'

/** One in-flight run per conversation; a second ask replaces the first. */
const inFlight = new Map<number, AbortController>()

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: AppError): Result<never> => ({ ok: false, error })

/** Turns any thrown value into an error envelope so the renderer never sees a raw throw. */
function guard<A extends unknown[], T>(
  handler: (...args: A) => Promise<Result<T>> | Result<T>
): (...args: A) => Promise<Result<T>> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('[ipc] handler failed:', detail)
      return fail({ code: 'UNKNOWN', message: 'Something went wrong inside the app.', detail })
    }
  }
}

function requireId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer id, got ${JSON.stringify(value)}`)
  }
  return value
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const emit = (event: StreamEvent): void => {
    getWindow()?.webContents.send(IPC.claudeStream, event)
  }

  ipcMain.handle(
    IPC.systemInfo,
    guard(async () => ok({ claudeBinary: await resolveClaudeBinary(), appVersion }))
  )

  /**
   * Thin on purpose: the dialog is a native sheet that cannot be driven from a
   * test, so no logic lives here. Validation happens in claude:ask, which is.
   */
  ipcMain.handle(
    IPC.filesPick,
    guard(async () => {
      const window = getWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Attach files',
        buttonLabel: 'Attach',
        properties: ['openFile', 'multiSelections']
      }
      const picked = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return ok<readonly string[]>(picked.canceled ? [] : picked.filePaths)
    })
  )

  /**
   * The path comes from Claude's output, so `openFile` re-checks it from
   * scratch — absolute, existing, spawned as argv — and never shells out.
   */
  ipcMain.handle(
    IPC.filesOpen,
    guard((_event, path: unknown, line: unknown) => openFile(path, line))
  )

  ipcMain.handle(
    IPC.settingsGet,
    guard(() => ok(getSettingsView()))
  )

  /** The patch is whatever the renderer sent; the store normalises it. */
  ipcMain.handle(
    IPC.settingsSet,
    guard((_event, patch: unknown) => ok(updateSettings(patch)))
  )

  /** Pass null to forget the stored key. The key itself never comes back out. */
  ipcMain.handle(
    IPC.settingsSetVoiceKey,
    guard((_event, key: unknown) => setVoiceApiKey(key === null ? null : key))
  )

  ipcMain.handle(
    IPC.settingsOpenFile,
    guard(() => openSettingsFile())
  )

  ipcMain.handle(
    IPC.conversationsList,
    guard(() => ok<readonly Conversation[]>(listConversations()))
  )

  ipcMain.handle(
    IPC.conversationsCreate,
    guard((_event, input: CreateConversationInput = {}) => ok(createConversation(input)))
  )

  ipcMain.handle(
    IPC.conversationsRename,
    guard((_event, rawId: unknown, title: unknown) => {
      const id = requireId(rawId)
      if (typeof title !== 'string')
        return fail({ code: 'INVALID_INPUT', message: 'Title must be text.' })
      const updated = renameConversation(id, title.slice(0, LIMITS.titleMaxLength))
      return updated
        ? ok(updated)
        : fail({ code: 'NOT_FOUND', message: 'That conversation no longer exists.' })
    })
  )

  ipcMain.handle(
    IPC.conversationsDelete,
    guard((_event, rawId: unknown) => {
      const id = requireId(rawId)
      inFlight.get(id)?.abort()
      return ok(deleteConversation(id))
    })
  )

  ipcMain.handle(
    IPC.messagesList,
    guard((_event, rawId: unknown) => ok<readonly Message[]>(listMessages(requireId(rawId))))
  )

  ipcMain.handle(
    IPC.claudeCancel,
    guard((_event, rawId: unknown) => {
      const controller = inFlight.get(requireId(rawId))
      controller?.abort()
      return ok(controller !== undefined)
    })
  )

  ipcMain.handle(
    IPC.claudeAsk,
    guard(async (_event, request: AskRequest) => {
      const conversationId = requireId(request?.conversationId)
      const prompt = typeof request?.prompt === 'string' ? request.prompt.trim() : ''

      if (!prompt) return fail({ code: 'INVALID_INPUT', message: 'Type something first.' })
      if (prompt.length > LIMITS.promptMaxLength) {
        return fail({
          code: 'INVALID_INPUT',
          message: `That prompt is too long (limit ${LIMITS.promptMaxLength.toLocaleString()} characters).`
        })
      }

      // Both of these end up in argv, so neither is taken on trust.
      const model = request?.model ?? null
      if (model !== null && !isModelId(model)) {
        return fail({ code: 'INVALID_INPUT', message: `Unknown model: ${String(model)}` })
      }

      // A bad --effort does not fail the run: the CLI warns and quietly uses its
      // default, so the app would record a level that never ran. Stop it here.
      const effort = request?.effort ?? null
      if (effort !== null && !isEffortId(effort)) {
        return fail({ code: 'INVALID_INPUT', message: `Unknown effort: ${String(effort)}` })
      }

      const attachments = validateAttachments(request?.attachments)
      if (!attachments.ok) return fail(attachments.error)

      const composed = composePrompt(prompt, attachments.paths)

      const conversation = findConversation(conversationId)
      if (!conversation)
        return fail({ code: 'NOT_FOUND', message: 'That conversation no longer exists.' })

      inFlight.get(conversationId)?.abort()
      const controller = new AbortController()
      inFlight.set(conversationId, controller)
      emit({ type: 'started', conversationId })

      try {
        const outcome = await runClaude({
          prompt: composed.prompt,
          sessionId: conversation.sessionId,
          resume: conversation.sessionStarted,
          cwd: conversation.cwd,
          model,
          effort,
          addDirs: composed.addDirs,
          signal: controller.signal,
          onDelta: (text) => emit({ type: 'delta', conversationId, text }),
          onTool: (name) => emit({ type: 'tool', conversationId, name })
        })

        const cliRan =
          outcome.error?.code !== 'BINARY_NOT_FOUND' && outcome.error?.code !== 'SPAWN_FAILED'
        if (cliRan && !conversation.sessionStarted) markSessionStarted(conversationId)

        const message = insertHistory({
          conversationId,
          // Stored as sent, so the transcript shows the @mentions that ran.
          prompt: composed.prompt,
          response: outcome.text,
          model,
          effort,
          error: outcome.error ? formatError(outcome.error) : null,
          durationMs: outcome.durationMs,
          costUsd: outcome.costUsd
        })

        const refreshed = findConversation(conversationId)
        if (!refreshed)
          return fail({ code: 'NOT_FOUND', message: 'That conversation was deleted mid-run.' })

        return outcome.error && !outcome.text
          ? fail(outcome.error)
          : ok<AskResult>({ message, conversation: refreshed })
      } finally {
        if (inFlight.get(conversationId) === controller) inFlight.delete(conversationId)
        emit({ type: 'settled', conversationId })
      }
    })
  )
}

/** Aborts every running CLI process; called on quit so none are orphaned. */
export function abortAllRuns(): void {
  for (const controller of inFlight.values()) controller.abort()
  inFlight.clear()
}

const formatError = (error: AppError): string =>
  error.detail ? `${error.message}\n\n${error.detail}` : error.message
