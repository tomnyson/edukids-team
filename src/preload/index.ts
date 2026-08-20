import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type { SettingsView } from '@shared/settings'
import type {
  AskRequest,
  AskResult,
  Conversation,
  CreateConversationInput,
  Message,
  OpenedFile,
  Result,
  StreamEvent,
  SystemInfo
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
