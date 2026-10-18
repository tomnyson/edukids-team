import { ipcMain, type BrowserWindow } from 'electron'
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
import { runCompanyOrchestration } from '../orchestrator'
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
        signal: controller.signal,
        onEvent: sendEvent
      })
        .catch((err) => {
          sendEvent({
            type: 'error',
            conversationId,
            error: { code: 'CLI_ERROR', message: err instanceof Error ? err.message : String(err) }
          })
        })
        .finally(() => {
          inFlightCompanyRuns.delete(conversationId)
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
      const testModelId =
        config.id === 'opencode'
          ? 'opencode/mimo-v2.6-flash-free'
          : config.id === 'gemini'
            ? 'gemini-2.0-flash'
            : config.id === 'anthropic'
              ? 'claude-3-5-haiku-20241022'
              : 'gpt-4o-mini'

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
    guard(async (_event, provider: ProviderId): Promise<Result<readonly ModelOption[]>> => {
      const config = getProviderConfig(provider)
      const models = await fetchModelsForProvider(
        provider,
        config?.apiKey ?? undefined,
        config?.baseUrl ?? undefined
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
