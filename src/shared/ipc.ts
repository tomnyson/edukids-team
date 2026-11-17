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

export const COMPANY_CHANNELS = {
  list: 'companies:list',
  get: 'companies:get',
  create: 'companies:create',
  update: 'companies:update',
  delete: 'companies:delete',
  addMember: 'companies:add-member',
  updateMember: 'companies:update-member',
  deleteMember: 'companies:delete-member',
  messagesList: 'companies:messages-list',
  askStream: 'companies:ask-stream',
  stopStream: 'companies:stop-stream',
  streamEvent: 'companies:stream-event'
} as const

export const PROVIDER_CHANNELS = {
  getAll: 'providers:get-all',
  set: 'providers:set',
  testConnection: 'providers:test',
  listModels: 'providers:list-models'
} as const

export const VOICE_CHANNELS = {
  ensureMic: 'voice:ensure-mic',
  status: 'voice:status',
  transcribe: 'voice:transcribe',
  cancelTranscribe: 'voice:cancel-transcribe',
  downloadModel: 'voice:download-model',
  cancelDownload: 'voice:cancel-download',
  downloadProgress: 'voice:download-progress'
} as const

export const SKILL_CHANNELS = {
  list: 'skills:list',
  get: 'skills:get',
  create: 'skills:create',
  update: 'skills:update',
  importFolder: 'skills:import-folder',
  delete: 'skills:delete',
  reveal: 'skills:reveal',
  setMemberSkills: 'skills:set-member-skills'
} as const

/** New members the CEO proposed; approving one is the only way it joins the team. */
export const PROPOSAL_CHANNELS = {
  list: 'proposals:list',
  approve: 'proposals:approve',
  reject: 'proposals:reject'
} as const

export const SEARCH_CHANNELS = {
  test: 'search:test'
} as const

/** Prompts waiting behind a running one; `changed` is pushed from main on every change. */
export const QUEUE_CHANNELS = {
  submit: 'queue:submit',
  remove: 'queue:remove',
  resume: 'queue:resume',
  clear: 'queue:clear',
  state: 'queue:state',
  changed: 'queue:changed'
} as const

export type IpcChannel =
  | (typeof IPC)[keyof typeof IPC]
  | (typeof COMPANY_CHANNELS)[keyof typeof COMPANY_CHANNELS]
  | (typeof PROVIDER_CHANNELS)[keyof typeof PROVIDER_CHANNELS]
  | (typeof VOICE_CHANNELS)[keyof typeof VOICE_CHANNELS]
  | (typeof SKILL_CHANNELS)[keyof typeof SKILL_CHANNELS]
  | (typeof QUEUE_CHANNELS)[keyof typeof QUEUE_CHANNELS]
  | (typeof SEARCH_CHANNELS)[keyof typeof SEARCH_CHANNELS]
  | (typeof PROPOSAL_CHANNELS)[keyof typeof PROPOSAL_CHANNELS]

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
  projectNameMaxLength: 80,
  /** One dictation clip; the renderer stops recording here. */
  voiceMaxSeconds: 120,
  /** 120 s of 16 kHz mono 16-bit audio is 3.84 MB plus the header; this leaves headroom. */
  voiceMaxBytes: 4_000_000
} as const
