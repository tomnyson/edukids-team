/**
 * Global app settings: the shape, the defaults, and the only function allowed
 * to turn untrusted JSON into that shape.
 *
 * The file on disk is hand-editable, so every read goes through `normalise`:
 * a bad value falls back to its default rather than reaching the UI or argv.
 */
import { isEffortId, isModelId, type EffortId, type ModelId } from './types'

export const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const EDITORS = [
  { id: 'code', label: 'VS Code', hint: 'Opens at the exact line' },
  { id: 'system', label: 'System default', hint: 'Whatever macOS associates' }
] as const

export type EditorId = (typeof EDITORS)[number]['id']

export const VOICE_BACKENDS = [
  { id: 'local', label: 'On this Mac', hint: 'whisper.cpp — audio never leaves the machine' },
  { id: 'cloud', label: 'API', hint: 'Audio is uploaded to a third-party service' }
] as const

export type VoiceBackendId = (typeof VOICE_BACKENDS)[number]['id']

/** Whisper model names, smallest first. Bigger is slower and more accurate. */
export const VOICE_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3'] as const
export type VoiceModelId = (typeof VOICE_MODELS)[number]

export const SEND_KEYS = [
  { id: 'enter', label: 'Enter sends', hint: 'Shift+Enter for a new line' },
  { id: 'mod-enter', label: '⌘+Enter sends', hint: 'Enter always makes a new line' }
] as const

export type SendKeyId = (typeof SEND_KEYS)[number]['id']

export interface VoiceSettings {
  readonly backend: VoiceBackendId
  /** BCP-47-ish two-letter code, or 'auto' to let the model decide. */
  readonly language: string
  readonly localModel: VoiceModelId
}

export interface AppSettings {
  readonly theme: ThemeId
  /** Seeds the picker for a new chat; null means "let the CLI decide". */
  readonly defaultModel: ModelId | null
  readonly defaultEffort: EffortId | null
  readonly editor: EditorId
  readonly sendKey: SendKeyId
  readonly voice: VoiceSettings
}

/**
 * What the renderer receives. The API key itself never crosses the bridge —
 * only whether one is stored.
 */
export interface SettingsView extends AppSettings {
  readonly voiceKeyConfigured: boolean
}

/** Dark by default: the app commits to that register until told otherwise. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultModel: null,
  defaultEffort: null,
  editor: 'code',
  sendKey: 'enter',
  voice: {
    backend: 'local',
    // Vietnamese is badly served by the small models at 'auto', but guessing a
    // language is worse than letting the model detect one.
    language: 'auto',
    localModel: 'small'
  }
}

const LANGUAGE = /^(auto|[a-z]{2})$/

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** Never throws. Anything unrecognised is replaced by its default. */
export function normaliseSettings(raw: unknown): AppSettings {
  const input = record(raw)
  const voice = record(input.voice)
  const language = typeof voice.language === 'string' ? voice.language : ''

  return {
    theme: oneOf(
      THEMES.map((theme) => theme.id),
      input.theme,
      DEFAULT_SETTINGS.theme
    ),
    defaultModel: isModelId(input.defaultModel) ? (input.defaultModel as ModelId) : null,
    defaultEffort: isEffortId(input.defaultEffort) ? (input.defaultEffort as EffortId) : null,
    editor: oneOf(
      EDITORS.map((editor) => editor.id),
      input.editor,
      DEFAULT_SETTINGS.editor
    ),
    sendKey: oneOf(
      SEND_KEYS.map((key) => key.id),
      input.sendKey,
      DEFAULT_SETTINGS.sendKey
    ),
    voice: {
      backend: oneOf(
        VOICE_BACKENDS.map((backend) => backend.id),
        voice.backend,
        DEFAULT_SETTINGS.voice.backend
      ),
      language: LANGUAGE.test(language) ? language : DEFAULT_SETTINGS.voice.language,
      localModel: oneOf(VOICE_MODELS, voice.localModel, DEFAULT_SETTINGS.voice.localModel)
    }
  }
}

/**
 * Applies a partial update. Unknown keys are dropped and bad values fall back,
 * because this runs on whatever the renderer sent.
 */
export function mergeSettings(current: AppSettings, patch: unknown): AppSettings {
  const input = record(patch)
  return normaliseSettings({
    ...current,
    ...input,
    voice: { ...current.voice, ...record(input.voice) }
  })
}
