import { app, nativeTheme, safeStorage, shell } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  normaliseSettings,
  type AppSettings,
  type SettingsView
} from '@shared/settings'
import type { Result } from '@shared/types'

/**
 * Settings live in one hand-editable JSON file. The store keeps the parsed copy
 * in memory, writes atomically, and holds the voice API key as ciphertext that
 * only this process can read.
 */

const FILE = 'settings.json'
/** Long enough for any provider key, short enough to reject a pasted essay. */
const KEY_MAX_LENGTH = 400

interface StoredFile extends AppSettings {
  /** base64 of safeStorage ciphertext. Never sent to the renderer. */
  readonly voiceApiKey?: string
}

let cached: AppSettings | null = null
let cachedSecret: string | null = null

const filePath = (): string => join(app.getPath('userData'), FILE)

function load(): void {
  if (cached) return
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath(), 'utf8'))
    cached = normaliseSettings(parsed)
    const secret = (parsed as StoredFile | null)?.voiceApiKey
    cachedSecret = typeof secret === 'string' ? secret : null
  } catch {
    // Missing, unreadable or corrupt — the defaults are always a valid app.
    cached = DEFAULT_SETTINGS
    cachedSecret = null
  }
}

/** Write to a sibling then rename, so a crash can never leave half a file. */
function persist(): void {
  const payload: StoredFile = {
    ...(cached ?? DEFAULT_SETTINGS),
    ...(cachedSecret ? { voiceApiKey: cachedSecret } : {})
  }
  const target = filePath()
  const temporary = `${target}.tmp`
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, target)
}

export function getSettings(): AppSettings {
  load()
  return cached ?? DEFAULT_SETTINGS
}

export function getSettingsView(): SettingsView {
  return { ...getSettings(), voiceKeyConfigured: cachedSecret !== null }
}

/** The window chrome and native dialogs follow the same choice as the CSS. */
export function applyTheme(settings: AppSettings = getSettings()): void {
  nativeTheme.themeSource = settings.theme
}

export function updateSettings(patch: unknown): SettingsView {
  const next = mergeSettings(getSettings(), patch)
  cached = next
  persist()
  applyTheme(next)
  return getSettingsView()
}

/**
 * Stores the key encrypted, or refuses. Writing it in the clear would be worse
 * than not supporting the cloud backend at all.
 */
export function setVoiceApiKey(raw: unknown): Result<SettingsView> {
  load()

  if (raw === null) {
    cachedSecret = null
    persist()
    return { ok: true, data: getSettingsView() }
  }

  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'Paste a key first.' } }
  }
  if (raw.length > KEY_MAX_LENGTH) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'That is not an API key.' } }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: 'The system keychain is unavailable, so the key was not saved.'
      }
    }
  }

  cachedSecret = safeStorage.encryptString(raw.trim()).toString('base64')
  persist()
  return { ok: true, data: getSettingsView() }
}

/** Main-process only. Returns null when nothing is stored or decryption fails. */
export function getVoiceApiKey(): string | null {
  load()
  if (!cachedSecret || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(cachedSecret, 'base64'))
  } catch (error) {
    console.error('[settings] stored key could not be decrypted:', error)
    return null
  }
}

/** Reveals the file so a power user can edit what the UI does not expose. */
export async function openSettingsFile(): Promise<Result<string>> {
  const target = filePath()
  try {
    // Create it on demand: revealing a file that does not exist does nothing.
    load()
    persist()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { code: 'UNKNOWN', message: 'Could not write settings.', detail } }
  }
  shell.showItemInFolder(target)
  return { ok: true, data: target }
}

/** Test seam: forces the next read to come from disk. */
export function forgetSettings(): void {
  cached = null
  cachedSecret = null
}
