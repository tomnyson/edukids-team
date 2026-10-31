import { app, ipcMain, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { COMPANY_CHANNELS, PROVIDER_CHANNELS } from '@shared/ipc'
import type {
  AddMemberInput,
  AppError,
  Company,
  CompanyMember,
  CompanyMessage,
  CompanyStreamEvent,
  CreateCompanyInput,
  ModelOption,
  ProviderConfig,
  ProviderId,
  Result,
  UpdateCompanyInput,
  UpdateMemberInput
} from '@shared/types'
import {
  addCompanyMember,
  createCompany,
  deleteCompany,
  deleteCompanyMember,
  findCompany,
  listCompanies,
  listCompanyMessages,
  updateCompany,
  updateCompanyMember
} from '../db/companies'
import { getAllProviderConfigs, getProviderConfig, setProviderConfig } from '../db/providers'
import { findProject } from '../db/projects'
import { findConversation } from '../db/queries'
import { runCompanyOrchestration } from '../orchestrator'
import { resolveMeetingFolder } from '../orchestrator/meeting-folder'
import { dispatchLLM } from '../providers/gateway'
import { fetchModelsForProvider } from '../providers/model-fetcher'

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: AppError): Result<never> => ({ ok: false, error })

function guard<A extends unknown[], T>(
  handler: (...args: A) => Promise<Result<T>> | Result<T>
): (...args: A) => Promise<Result<T>> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return fail({ code: 'CLI_ERROR', message })
    }
  }
}

const inFlightCompanyRuns = new Map<number, AbortController>()

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

export function registerCompanyIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(COMPANY_CHANNELS.list, guard(async (): Promise<Result<readonly Company[]>> => {
    return ok(listCompanies())
  }))

  ipcMain.handle(COMPANY_CHANNELS.get, guard(async (_event, id: number): Promise<Result<Company | null>> => {
    return ok(findCompany(id))
  }))

  ipcMain.handle(COMPANY_CHANNELS.create, guard(async (_event, input: CreateCompanyInput): Promise<Result<Company>> => {
    return ok(createCompany(input))
  }))

  ipcMain.handle(COMPANY_CHANNELS.update, guard(async (_event, id: number, patch: UpdateCompanyInput): Promise<Result<Company>> => {
    return ok(updateCompany(id, patch))
  }))

  ipcMain.handle(COMPANY_CHANNELS.delete, guard(async (_event, id: number): Promise<Result<boolean>> => {
    deleteCompany(id)
    return ok(true)
  }))

  ipcMain.handle(COMPANY_CHANNELS.addMember, guard(async (_event, input: AddMemberInput): Promise<Result<CompanyMember>> => {
    return ok(addCompanyMember(input))
  }))

  ipcMain.handle(COMPANY_CHANNELS.updateMember, guard(async (_event, id: number, patch: UpdateMemberInput): Promise<Result<CompanyMember>> => {
    return ok(updateCompanyMember(id, patch))
  }))

  ipcMain.handle(COMPANY_CHANNELS.deleteMember, guard(async (_event, id: number): Promise<Result<boolean>> => {
    deleteCompanyMember(id)
    return ok(true)
  }))

  ipcMain.handle(COMPANY_CHANNELS.messagesList, guard(async (_event, conversationId: number): Promise<Result<readonly CompanyMessage[]>> => {
    return ok(listCompanyMessages(conversationId))
  }))

  ipcMain.handle(
    COMPANY_CHANNELS.askStream,
    guard(async (_event, companyId: number, conversationId: number, prompt: string): Promise<Result<boolean>> => {
      const company = findCompany(companyId)
      if (!company) {
        return fail({ code: 'NOT_FOUND', message: 'Company not found' })
      }

      const folder = await prepareMeetingFolder(conversationId)
      if (!folder.ok) return folder

      inFlightCompanyRuns.get(conversationId)?.abort()
      const controller = new AbortController()
      inFlightCompanyRuns.set(conversationId, controller)

      const win = getWindow()
      const sendEvent = (event: CompanyStreamEvent): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(COMPANY_CHANNELS.streamEvent, event)
        }
      }

      // Run asynchronously so handle returns immediately or after starting
      runCompanyOrchestration({
        company,
        conversationId,
        userPrompt: prompt,
        folder: folder.data,
        signal: controller.signal,
        onEvent: sendEvent
      })
        .catch((err) => {
          // A stop is not a failure: the renderer has already reset, and a newer ask owns the UI
          if (controller.signal.aborted) return
          sendEvent({
            type: 'error',
            conversationId,
            error: { code: 'CLI_ERROR', message: err instanceof Error ? err.message : String(err) }
          })
        })
        .finally(() => {
          // A stopped run can settle after a newer ask started; keep the newer run stoppable
          if (inFlightCompanyRuns.get(conversationId) === controller) {
            inFlightCompanyRuns.delete(conversationId)
          }
        })

      return ok(true)
    })
  )

  ipcMain.handle(COMPANY_CHANNELS.stopStream, guard(async (_event, conversationId: number): Promise<Result<boolean>> => {
    const controller = inFlightCompanyRuns.get(conversationId)
    if (controller) {
      controller.abort()
      inFlightCompanyRuns.delete(conversationId)
    }
    return ok(true)
  }))

  ipcMain.handle(PROVIDER_CHANNELS.getAll, guard(async (): Promise<Result<readonly ProviderConfig[]>> => {
    return ok(getAllProviderConfigs())
  }))

  ipcMain.handle(PROVIDER_CHANNELS.set, guard(async (_event, config: ProviderConfig): Promise<Result<boolean>> => {
    setProviderConfig(config)
    return ok(true)
  }))

  ipcMain.handle(
    PROVIDER_CHANNELS.testConnection,
    guard(async (_event, config: ProviderConfig): Promise<Result<boolean>> => {
      setProviderConfig(config)
      // Ping with a model this provider actually lists, preferring a free one
      const models = await fetchModelsForProvider(
        config.id,
        config.apiKey ?? undefined,
        config.baseUrl ?? undefined
      )
      const testModelId = (models.find((m) => m.free) ?? models[0])?.id
      if (!testModelId) {
        throw new Error(`No models available for ${config.id}`)
      }

      await dispatchLLM(
        {
          provider: config.id,
          modelId: testModelId,
          systemPrompt: 'Respond with OK',
          messages: [{ role: 'user', content: 'ping' }]
        },
        { onContentDelta: () => {} }
      )
      return ok(true)
    })
  )

  ipcMain.handle(
    PROVIDER_CHANNELS.listModels,
    guard(async (_event, provider: ProviderId, refresh?: unknown): Promise<Result<readonly ModelOption[]>> => {
      const config = getProviderConfig(provider)
      const models = await fetchModelsForProvider(
        provider,
        config?.apiKey ?? undefined,
        config?.baseUrl ?? undefined,
        refresh === true
      )
      return ok(models)
    })
  )
}

export function abortAllCompanyRuns(): void {
  for (const controller of inFlightCompanyRuns.values()) {
    controller.abort()
  }
  inFlightCompanyRuns.clear()
}
