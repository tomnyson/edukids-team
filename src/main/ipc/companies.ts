import { ipcMain, type BrowserWindow } from 'electron'
import { COMPANY_CHANNELS, PROVIDER_CHANNELS } from '@shared/ipc'
import { isConversationId } from '@shared/queue'
import type {
  AddMemberInput,
  AppError,
  Company,
  CompanyMember,
  CompanyMessage,
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
import { dispatchLLM } from '../providers/gateway'
import { fetchModelsForProvider } from '../providers/model-fetcher'
import {
  freezeCompanyQueue,
  setCompanyQueueWindow,
  stopCompanyRun,
  submitCompanyPrompt
} from './company-queue'

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

export function registerCompanyIpcHandlers(getWindow: () => BrowserWindow | null): void {
  setCompanyQueueWindow(getWindow)

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

  /** Queues the prompt behind the meeting's others; progress arrives as stream events. */
  ipcMain.handle(
    COMPANY_CHANNELS.askStream,
    guard(
      (
        _event,
        companyId: unknown,
        conversationId: unknown,
        prompt: unknown,
        searchMode: unknown
      ) => submitCompanyPrompt(companyId, conversationId, prompt, searchMode)
    )
  )

  /** Stops the running meeting and holds the prompts behind it until resumed. */
  ipcMain.handle(
    COMPANY_CHANNELS.stopStream,
    guard((_event, conversationId: unknown) =>
      isConversationId(conversationId)
        ? ok(stopCompanyRun(conversationId))
        : fail({ code: 'INVALID_INPUT', message: 'That meeting is not valid.' })
    )
  )

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

/** For quit: refuses new meeting prompts, drops the waiting ones, aborts every meeting. */
export function abortAllCompanyRuns(): void {
  freezeCompanyQueue()
}
