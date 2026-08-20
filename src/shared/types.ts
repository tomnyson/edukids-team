/** Domain types shared between the main and renderer processes. */

/**
 * Model aliases the CLI accepts for `--model`. `null` anywhere a ModelId is
 * optional means "omit the flag" — the CLI keeps whatever default is configured.
 */
export const MODELS = [
  { id: 'opus', label: 'Opus', hint: 'Deepest reasoning' },
  { id: 'sonnet', label: 'Sonnet', hint: 'Balanced for everyday work' },
  { id: 'haiku', label: 'Haiku', hint: 'Fastest and lightest' },
  // The CLI publishes no description for Fable; the row renders label-only
  // rather than carrying a claim nothing backs.
  { id: 'fable', label: 'Fable', hint: null }
] as const

export type ModelId = (typeof MODELS)[number]['id']

/** The value reaches argv, so membership is checked rather than assumed. */
export const isModelId = (value: unknown): value is ModelId =>
  MODELS.some((model) => model.id === value)

/**
 * Levels the CLI accepts for `--effort`. An unknown value does not fail the
 * run — the CLI warns and silently falls back to its default — so this list is
 * the only thing standing between a typo and a turn that lies about how it ran.
 */
export const EFFORTS = [
  { id: 'low', label: 'Low', hint: 'Fastest, least thorough' },
  { id: 'medium', label: 'Medium', hint: 'Balanced speed and depth' },
  { id: 'high', label: 'High', hint: 'More reasoning, slower' },
  { id: 'xhigh', label: 'Extra high', hint: 'Deep reasoning on hard problems' },
  { id: 'max', label: 'Max', hint: 'Maximum reasoning, slowest' }
] as const

export type EffortId = (typeof EFFORTS)[number]['id']

export const isEffortId = (value: unknown): value is EffortId =>
  EFFORTS.some((effort) => effort.id === value)

export interface Conversation {
  readonly id: number
  /** UUID passed to the Claude CLI via --session-id / --resume. */
  readonly sessionId: string
  readonly title: string
  /** Working directory the CLI runs in; Claude Code is project-aware. */
  readonly cwd: string
  /** True once the CLI has created this session, so the next turn uses --resume. */
  readonly sessionStarted: boolean
  /** Model used by the most recent turn; seeds the picker when reopening. */
  readonly lastModel: ModelId | null
  /** Effort used by the most recent turn; seeds the picker when reopening. */
  readonly lastEffort: EffortId | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly messageCount: number
}

export interface Message {
  readonly id: number
  readonly conversationId: number
  readonly prompt: string
  readonly response: string
  /** Present when the run failed; `response` then holds whatever was streamed. */
  readonly error: string | null
  /** Which model answered this turn; null when the CLI default was used. */
  readonly model: ModelId | null
  /** Effort this turn ran at; null when the flag was omitted. */
  readonly effort: EffortId | null
  readonly durationMs: number | null
  readonly costUsd: number | null
  readonly createdAt: string
}

/** What the renderer needs to know about the host at boot. */
export interface SystemInfo {
  /** Absolute path to the resolved `claude` binary, or null when missing. */
  readonly claudeBinary: string | null
  readonly appVersion: string
}

export type ClaudeErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'SPAWN_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'CLI_ERROR'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DB_ERROR'
  | 'UNKNOWN'

export interface AppError {
  readonly code: ClaudeErrorCode
  readonly message: string
  /** Operator-facing detail (stderr tail, stack); may be empty. */
  readonly detail?: string
}

/** Every IPC invoke resolves to this envelope — never a bare throw. */
export type Result<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: AppError }

export interface AskRequest {
  readonly conversationId: number
  readonly prompt: string
  readonly model?: ModelId | null
  readonly effort?: EffortId | null
  /**
   * Absolute paths sent separately from the prompt: the main process needs them
   * to derive `--add-dir`, and parsing `@` mentions back out of prose is fragile.
   */
  readonly attachments?: readonly string[]
}

export interface AskResult {
  readonly message: Message
  readonly conversation: Conversation
}

/** Push events emitted while a run is in flight. */
export type StreamEvent =
  | { readonly type: 'started'; readonly conversationId: number }
  | { readonly type: 'delta'; readonly conversationId: number; readonly text: string }
  | { readonly type: 'tool'; readonly conversationId: number; readonly name: string }
  | { readonly type: 'settled'; readonly conversationId: number }

/** What happened when a file path from the transcript was opened. */
export interface OpenedFile {
  readonly path: string
  /** Which app took it: the VS Code CLI, or whatever macOS associates. */
  readonly editor: 'code' | 'system'
}

export interface CreateConversationInput {
  readonly title?: string
  readonly cwd?: string
}
