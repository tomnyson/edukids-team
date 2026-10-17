/** Single source of truth for IPC channel names. */
export const IPC = {
  conversationsList: 'conversations:list',
  conversationsCreate: 'conversations:create',
  conversationsDelete: 'conversations:delete',
  conversationsRename: 'conversations:rename',
  messagesList: 'messages:list',
  claudeAsk: 'claude:ask',
  claudeCancel: 'claude:cancel',
  claudeStream: 'claude:stream',
  systemInfo: 'system:info',
  filesPick: 'files:pick',
  filesOpen: 'files:open',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsSetVoiceKey: 'settings:setVoiceKey',
  settingsOpenFile: 'settings:openFile',
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsUpdate: 'projects:update',
  projectsRemove: 'projects:remove'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Guardrails applied at the IPC boundary before anything reaches the CLI. */
export const LIMITS = {
  promptMaxLength: 100_000,
  titleMaxLength: 200,
  /**
   * Idle, not total: the clock restarts on every byte the CLI writes. A long
   * agentic run streams tool events throughout, so only a genuinely silent
   * process trips this.
   */
  runIdleTimeoutMs: 300_000,
  maxAttachments: 20,
  projectNameMaxLength: 80
} as const
