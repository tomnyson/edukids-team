import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  COMPANY_CHANNELS,
  PROVIDER_CHANNELS,
  QUEUE_CHANNELS,
  PROPOSAL_CHANNELS,
  SEARCH_CHANNELS,
  SKILL_CHANNELS,
  VOICE_CHANNELS
} from '@shared/ipc'
import type { QueueKind, QueueSnapshot, QueueSubmitRequest, QueuedPrompt } from '@shared/queue'
import type { MemberProposal, ProposalDraft } from '@shared/proposals'
import type { SearchMode } from '@shared/search'
import type { SkillDetail, SkillDraft, SkillSummary } from '@shared/skills'
import type { SettingsView, VoiceModelId } from '@shared/settings'
import type { MicAccess, VoiceDownloadProgress, VoiceStatus } from '@shared/voice'
import type {
  AddMemberInput,
  AskRequest,
  AskResult,
  Company,
  CompanyMember,
  CompanyMessage,
  CompanyStreamEvent,
  Conversation,
  CreateCompanyInput,
  CreateConversationInput,
  Message,
  ModelOption,
  OpenedFile,
  Project,
  ProjectPatch,
  ProviderConfig,
  ProviderId,
  Result,
  StreamEvent,
  SystemInfo,
  UpdateCompanyInput,
  UpdateMemberInput
} from '@shared/types'

/**
 * The only surface the renderer gets. No ipcRenderer, no Node, no arbitrary
 * channel names — each method maps to one vetted channel.
 */
const api = {
  systemInfo: (): Promise<Result<SystemInfo>> => ipcRenderer.invoke(IPC.systemInfo),

  getSettings: (): Promise<Result<SettingsView>> => ipcRenderer.invoke(IPC.settingsGet),

  /** Partial update; unknown keys and bad values are dropped by the main process. */
  updateSettings: (patch: Record<string, unknown>): Promise<Result<SettingsView>> =>
    ipcRenderer.invoke(IPC.settingsSet, patch),

  /** Stores the key in the system keychain, or refuses. Pass null to clear it. */
  setVoiceApiKey: (key: string | null): Promise<Result<SettingsView>> =>
    ipcRenderer.invoke(IPC.settingsSetVoiceKey, key),

  /** Reveals settings.json in Finder for hand-editing. */
  openSettingsFile: (): Promise<Result<string>> => ipcRenderer.invoke(IPC.settingsOpenFile),

  listProjects: (): Promise<Result<readonly Project[]>> => ipcRenderer.invoke(IPC.projectsList),

  /** Opens the folder picker; resolves to null when the user cancels. */
  addProject: (): Promise<Result<Project | null>> => ipcRenderer.invoke(IPC.projectsAdd),

  updateProject: (id: number, patch: ProjectPatch): Promise<Result<Project>> =>
    ipcRenderer.invoke(IPC.projectsUpdate, id, patch),

  /** Detaches the project's conversations rather than deleting them. */
  removeProject: (id: number): Promise<Result<boolean>> =>
    ipcRenderer.invoke(IPC.projectsRemove, id),

  listConversations: (): Promise<Result<readonly Conversation[]>> =>
    ipcRenderer.invoke(IPC.conversationsList),

  createConversation: (input?: CreateConversationInput): Promise<Result<Conversation>> =>
    ipcRenderer.invoke(IPC.conversationsCreate, input ?? {}),

  renameConversation: (id: number, title: string): Promise<Result<Conversation>> =>
    ipcRenderer.invoke(IPC.conversationsRename, id, title),

  deleteConversation: (id: number): Promise<Result<boolean>> =>
    ipcRenderer.invoke(IPC.conversationsDelete, id),

  listMessages: (conversationId: number): Promise<Result<readonly Message[]>> =>
    ipcRenderer.invoke(IPC.messagesList, conversationId),

  ask: (request: AskRequest): Promise<Result<AskResult>> =>
    ipcRenderer.invoke(IPC.claudeAsk, request),

  cancel: (conversationId: number): Promise<Result<boolean>> =>
    ipcRenderer.invoke(IPC.claudeCancel, conversationId),

  /** Opens the native attach sheet; resolves to [] when the user cancels. */
  pickFiles: (): Promise<Result<readonly string[]>> => ipcRenderer.invoke(IPC.filesPick),

  /** Opens a file the transcript mentioned in VS Code, or in the system editor. */
  openInEditor: (path: string, line: number | null): Promise<Result<OpenedFile>> =>
    ipcRenderer.invoke(IPC.filesOpen, path, line),

  /**
   * Only the preload can reach `webUtils`, and only it can turn a dropped File
   * back into a disk path. Anything without one (an image dragged from a
   * browser, a virtual item) yields '' so the caller can say it was skipped.
   */
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  /** Returns an unsubscribe function — call it on effect cleanup. */
  onStream: (listener: (event: StreamEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: StreamEvent): void => listener(payload)
    ipcRenderer.on(IPC.claudeStream, handler)
    return () => ipcRenderer.removeListener(IPC.claudeStream, handler)
  },

  /** Prompts waiting behind a running one, per conversation; solo and company queue apart. */
  queue: {
    /** Queues a solo prompt and returns at once; the run streams on onStream when its turn comes. */
    submit: (request: QueueSubmitRequest): Promise<Result<QueuedPrompt>> =>
      ipcRenderer.invoke(QUEUE_CHANNELS.submit, request),
    state: (kind: QueueKind, conversationId: number): Promise<Result<QueueSnapshot>> =>
      ipcRenderer.invoke(QUEUE_CHANNELS.state, kind, conversationId),
    /** Takes out a waiting prompt; false for the running one, which is stopped instead. */
    remove: (kind: QueueKind, conversationId: number, itemId: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke(QUEUE_CHANNELS.remove, kind, conversationId, itemId),
    resume: (kind: QueueKind, conversationId: number): Promise<Result<QueueSnapshot>> =>
      ipcRenderer.invoke(QUEUE_CHANNELS.resume, kind, conversationId),
    clear: (kind: QueueKind, conversationId: number): Promise<Result<QueueSnapshot>> =>
      ipcRenderer.invoke(QUEUE_CHANNELS.clear, kind, conversationId),
    onChanged: (listener: (snapshot: QueueSnapshot) => void): (() => void) => {
      const handler = (_event: unknown, payload: QueueSnapshot): void => listener(payload)
      ipcRenderer.on(QUEUE_CHANNELS.changed, handler)
      return () => ipcRenderer.removeListener(QUEUE_CHANNELS.changed, handler)
    }
  },

  companies: {
    list: (): Promise<Result<readonly Company[]>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.list),
    get: (id: number): Promise<Result<Company | null>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.get, id),
    create: (input: CreateCompanyInput): Promise<Result<Company>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.create, input),
    update: (id: number, patch: UpdateCompanyInput): Promise<Result<Company>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.update, id, patch),
    delete: (id: number): Promise<Result<boolean>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.delete, id),
    addMember: (input: AddMemberInput): Promise<Result<CompanyMember>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.addMember, input),
    updateMember: (id: number, patch: UpdateMemberInput): Promise<Result<CompanyMember>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.updateMember, id, patch),
    deleteMember: (id: number): Promise<Result<boolean>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.deleteMember, id),
    listMessages: (conversationId: number): Promise<Result<readonly CompanyMessage[]>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.messagesList, conversationId),
    /** Queues the prompt behind the meeting's others; progress arrives on onStreamEvent. */
    askStream: (
      companyId: number,
      conversationId: number,
      prompt: string,
      searchMode: SearchMode = 'off'
    ): Promise<Result<QueuedPrompt>> =>
      ipcRenderer.invoke(
        COMPANY_CHANNELS.askStream,
        companyId,
        conversationId,
        prompt,
        searchMode
      ),
    stopStream: (conversationId: number): Promise<Result<boolean>> =>
      ipcRenderer.invoke(COMPANY_CHANNELS.stopStream, conversationId),
    onStreamEvent: (listener: (event: CompanyStreamEvent) => void): (() => void) => {
      const handler = (_event: unknown, payload: CompanyStreamEvent): void => listener(payload)
      ipcRenderer.on(COMPANY_CHANNELS.streamEvent, handler)
      return () => ipcRenderer.removeListener(COMPANY_CHANNELS.streamEvent, handler)
    }
  },

  providers: {
    getAll: (): Promise<Result<readonly ProviderConfig[]>> =>
      ipcRenderer.invoke(PROVIDER_CHANNELS.getAll),
    set: (config: ProviderConfig): Promise<Result<boolean>> =>
      ipcRenderer.invoke(PROVIDER_CHANNELS.set, config),
    testConnection: (config: ProviderConfig): Promise<Result<boolean>> =>
      ipcRenderer.invoke(PROVIDER_CHANNELS.testConnection, config),
    listModels: (provider: ProviderId, refresh = false): Promise<Result<readonly ModelOption[]>> =>
      ipcRenderer.invoke(PROVIDER_CHANNELS.listModels, provider, refresh)
  },

  proposals: {
    list: (conversationId: number): Promise<Result<readonly MemberProposal[]>> =>
      ipcRenderer.invoke(PROPOSAL_CHANNELS.list, conversationId),
    /** Adds the member as edited; the main process checks every field again. */
    approve: (id: number, draft: ProposalDraft): Promise<Result<MemberProposal>> =>
      ipcRenderer.invoke(PROPOSAL_CHANNELS.approve, id, draft),
    reject: (id: number): Promise<Result<MemberProposal>> =>
      ipcRenderer.invoke(PROPOSAL_CHANNELS.reject, id)
  },

  search: {
    /** Runs one query with the saved settings; resolves to how many results came back. */
    test: (): Promise<Result<number>> => ipcRenderer.invoke(SEARCH_CHANNELS.test)
  },

  voice: {
    /** Asks macOS for the microphone on first use; reports the state after that. */
    ensureMic: (): Promise<Result<MicAccess>> => ipcRenderer.invoke(VOICE_CHANNELS.ensureMic),
    status: (): Promise<Result<VoiceStatus>> => ipcRenderer.invoke(VOICE_CHANNELS.status),
    /** A 16 kHz mono 16-bit WAV clip; resolves to the cleaned transcript. */
    transcribe: (wav: Uint8Array): Promise<Result<string>> =>
      ipcRenderer.invoke(VOICE_CHANNELS.transcribe, wav),
    cancelTranscribe: (): Promise<Result<boolean>> =>
      ipcRenderer.invoke(VOICE_CHANNELS.cancelTranscribe),
    downloadModel: (model: VoiceModelId): Promise<Result<VoiceStatus>> =>
      ipcRenderer.invoke(VOICE_CHANNELS.downloadModel, model),
    cancelDownload: (model: VoiceModelId): Promise<Result<boolean>> =>
      ipcRenderer.invoke(VOICE_CHANNELS.cancelDownload, model),
    onDownloadProgress: (listener: (progress: VoiceDownloadProgress) => void): (() => void) => {
      const handler = (_event: unknown, payload: VoiceDownloadProgress): void => listener(payload)
      ipcRenderer.on(VOICE_CHANNELS.downloadProgress, handler)
      return () => ipcRenderer.removeListener(VOICE_CHANNELS.downloadProgress, handler)
    }
  },

  skills: {
    /** Both libraries, metadata only. */
    list: (): Promise<Result<readonly SkillSummary[]>> => ipcRenderer.invoke(SKILL_CHANNELS.list),
    get: (ref: string): Promise<Result<SkillDetail>> => ipcRenderer.invoke(SKILL_CHANNELS.get, ref),
    create: (draft: SkillDraft): Promise<Result<SkillDetail>> =>
      ipcRenderer.invoke(SKILL_CHANNELS.create, draft),
    /** App skills only; `dir` is the folder name and cannot change. */
    update: (dir: string, draft: SkillDraft): Promise<Result<SkillDetail>> =>
      ipcRenderer.invoke(SKILL_CHANNELS.update, dir, draft),
    /** Opens a folder picker in the main process and copies the chosen skill in. */
    importFolder: (): Promise<Result<SkillDetail>> =>
      ipcRenderer.invoke(SKILL_CHANNELS.importFolder),
    /** Moves an app skill to the Trash and detaches it from every member. */
    delete: (dir: string): Promise<Result<true>> => ipcRenderer.invoke(SKILL_CHANNELS.delete, dir),
    reveal: (ref: string): Promise<Result<true>> => ipcRenderer.invoke(SKILL_CHANNELS.reveal, ref),
    setMemberSkills: (memberId: number, refs: readonly string[]): Promise<Result<CompanyMember>> =>
      ipcRenderer.invoke(SKILL_CHANNELS.setMemberSkills, memberId, refs)
  }
}

export type ClaudeGuiApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[preload] failed to expose api:', error)
  }
} else {
  // @ts-ignore -- declared in index.d.ts
  window.api = api
}
