import { basename } from 'path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
// app.getVersion() reports Electron's own version until the app is packaged.
import { version as appVersion } from '../../../package.json'
import { IPC, LIMITS } from '@shared/ipc'
import type {
  AppError,
  Conversation,
  CreateConversationInput,
  Message,
  Project,
  ProjectPatch,
  Result
} from '@shared/types'
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  renameConversation
} from '../db/queries'
import {
  createProject,
  deleteProject,
  findProject,
  listProjects,
  updateProject
} from '../db/projects'
import { resolveClaudeBinary } from '../claude/environment'
import { openFile } from '../files/open'
import {
  getSettingsView,
  openSettingsFile,
  setVoiceApiKey,
  updateSettings
} from '../settings/store'
import { registerCompanyIpcHandlers, abortAllCompanyRuns } from './companies'
import { companyQueueControls, dropCompanyQueue } from './company-queue'
import { registerQueueIpcHandlers } from './queue'
import { dropSoloQueue, freezeSoloQueue, registerSoloIpcHandlers, soloQueueControls } from './solo'
import { abortVoiceWork, registerVoiceIpcHandlers } from './voice'
import { registerSkillIpcHandlers } from './skills'
import { registerSearchIpcHandlers } from './search'
import { registerProposalIpcHandlers } from './proposals'

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
  registerCompanyIpcHandlers(getWindow)
  registerVoiceIpcHandlers(getWindow)
  registerSkillIpcHandlers(getWindow)
  registerSearchIpcHandlers()
  registerProposalIpcHandlers()
  registerSoloIpcHandlers(getWindow)
  registerQueueIpcHandlers({ solo: soloQueueControls, company: companyQueueControls })

  ipcMain.handle(
    IPC.systemInfo,
    guard(async () => ok({ claudeBinary: await resolveClaudeBinary(), appVersion }))
  )

  /**
   * Thin on purpose: the dialog is a native sheet that cannot be driven from a
   * test, so no logic lives here. Validation happens when the prompt is asked or queued.
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
    IPC.projectsList,
    guard(() => ok<readonly Project[]>(listProjects()))
  )

  /**
   * The folder comes from the native picker, never from the renderer, so the
   * path this stores is one the user pointed at in Finder.
   */
  ipcMain.handle(
    IPC.projectsAdd,
    guard(async () => {
      const window = getWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Add a project folder',
        buttonLabel: 'Add project',
        properties: ['openDirectory', 'createDirectory']
      }
      const picked = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      const path = picked.canceled ? null : picked.filePaths[0]
      return ok<Project | null>(path ? createProject(path, basename(path) || path) : null)
    })
  )

  ipcMain.handle(
    IPC.projectsUpdate,
    guard((_event, rawId: unknown, rawPatch: unknown) => {
      const id = requireId(rawId)
      const patch = (rawPatch ?? {}) as ProjectPatch
      const name = typeof patch.name === 'string' ? patch.name.trim() : undefined
      if (name !== undefined && name.length > LIMITS.projectNameMaxLength) {
        return fail({ code: 'INVALID_INPUT', message: 'That name is too long.' })
      }

      const updated = updateProject(id, { ...patch, ...(name === undefined ? {} : { name }) })
      return updated
        ? ok(updated)
        : fail({ code: 'NOT_FOUND', message: 'That project no longer exists.' })
    })
  )

  /** Removing a project detaches its conversations; none of them are deleted. */
  ipcMain.handle(
    IPC.projectsRemove,
    guard((_event, rawId: unknown) => ok(deleteProject(requireId(rawId))))
  )

  /**
   * A chat started inside a project runs in that project's folder — the cwd is
   * read from the row here rather than trusted from the renderer.
   */
  ipcMain.handle(
    IPC.conversationsCreate,
    guard((_event, input: CreateConversationInput = {}) => {
      const project = input.projectId ? findProject(input.projectId) : null
      if (input.projectId && !project) {
        return fail({ code: 'NOT_FOUND', message: 'That project no longer exists.' })
      }
      return ok(
        createConversation({
          title: input.title,
          cwd: project?.path ?? input.cwd,
          projectId: project?.id ?? null
        })
      )
    })
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
      // Nothing queued for a deleted conversation may run
      dropSoloQueue(id)
      dropCompanyQueue(id)
      return ok(deleteConversation(id))
    })
  )

  ipcMain.handle(
    IPC.messagesList,
    guard((_event, rawId: unknown) => ok<readonly Message[]>(listMessages(requireId(rawId))))
  )
}

/** Aborts every running CLI process; called on quit so none are orphaned. */
export function abortAllRuns(): void {
  // Frozen first, so no queued prompt starts while the running ones wind down
  freezeSoloQueue()
  abortAllCompanyRuns()
  abortVoiceWork()
}
