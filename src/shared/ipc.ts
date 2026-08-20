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
  filesOpen: 'files:open'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Guardrails applied at the IPC boundary before anything reaches the CLI. */
export const LIMITS = {
  promptMaxLength: 100_000,
  titleMaxLength: 200,
  runTimeoutMs: 300_000,
  maxAttachments: 20
} as const
