import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ModelOption, ProviderId } from '@shared/types'

/**
 * Keyless model catalog backed by models.dev (the registry OpenCode uses).
 * Lets the model picker list current model IDs before an API key is configured,
 * and ranks live API results newest-first.
 *
 * Kept free of Electron imports so tests can load it directly under Node.
 */

const CATALOG_URL = 'https://models.dev/api.json'
const CATALOG_FILE = 'models-catalog.json'
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
// The full catalog is several MB, so allow more time than per-provider API calls
const CATALOG_TIMEOUT_MS = 15000

// models.dev provider keys, where they differ from our ProviderId
const CATALOG_KEYS = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'google',
  xai: 'xai',
  deepseek: 'deepseek'
} as const satisfies Partial<Record<ProviderId, string>>

export type CatalogProvider = keyof typeof CATALOG_KEYS
export type CatalogModels = Readonly<Record<CatalogProvider, readonly ModelOption[]>>

interface CatalogSnapshot {
  readonly fetchedAt: number
  readonly models: CatalogModels
}

const CATALOG_PROVIDERS = Object.keys(CATALOG_KEYS) as readonly CatalogProvider[]

let snapshot: CatalogSnapshot | null = null
let inFlight: Promise<CatalogSnapshot | null> | null = null

function byProvider(pick: (provider: CatalogProvider) => readonly ModelOption[]): CatalogModels {
  return {
    anthropic: pick('anthropic'),
    openai: pick('openai'),
    gemini: pick('gemini'),
    xai: pick('xai'),
    deepseek: pick('deepseek')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChatModel(model: Record<string, unknown>): boolean {
  const output = isRecord(model.modalities) ? model.modalities.output : undefined
  const producesText = !Array.isArray(output) || output.includes('text')
  return typeof model.id === 'string' && model.status !== 'deprecated' && producesText
}

function parseProvider(raw: unknown, provider: CatalogProvider): readonly ModelOption[] {
  const models = isRecord(raw) && isRecord(raw.models) ? Object.values(raw.models) : []

  return models
    .filter(isRecord)
    .filter(isChatModel)
    .map((m) => {
      const id = m.id as string
      return {
        option: {
          id,
          name: typeof m.name === 'string' && m.name ? m.name : id,
          free: false,
          reasoning: m.reasoning === true,
          provider
        },
        released: typeof m.release_date === 'string' ? m.release_date : ''
      }
    })
    .sort((a, b) => b.released.localeCompare(a.released))
    .map(({ option }) => option)
}

/** Converts the raw models.dev payload into newest-first model lists per provider. */
export function parseCatalog(raw: unknown): CatalogModels {
  const root = isRecord(raw) ? raw : {}
  return byProvider((p) => parseProvider(root[CATALOG_KEYS[p]], p))
}

/**
 * Orders a live API model list by catalog release date (newest first) and
 * takes display names and reasoning flags from the catalog. IDs the catalog
 * does not know keep their original order after the known ones.
 */
export function rankByCatalog(
  live: readonly ModelOption[],
  catalog: readonly ModelOption[]
): readonly ModelOption[] {
  const byId = new Map(catalog.map((model, index) => [model.id, { model, index }]))

  const known = live
    .filter((m) => byId.has(m.id))
    .map((m) => {
      const entry = byId.get(m.id)!
      return {
        option: { ...m, name: entry.model.name, reasoning: entry.model.reasoning },
        index: entry.index
      }
    })
    .sort((a, b) => a.index - b.index)
    .map(({ option }) => option)

  return [...known, ...live.filter((m) => !byId.has(m.id))]
}

function sanitizeCachedModels(raw: Record<string, unknown>): CatalogModels {
  return byProvider((p) => {
    const list = raw[p]
    return Array.isArray(list)
      ? list.filter(
          (m): m is ModelOption =>
            isRecord(m) && typeof m.id === 'string' && typeof m.name === 'string'
        )
      : []
  })
}

async function readSnapshot(cacheDir: string): Promise<CatalogSnapshot | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cacheDir, CATALOG_FILE), 'utf8'))
    if (!isRecord(parsed) || typeof parsed.fetchedAt !== 'number' || !isRecord(parsed.models)) {
      return null
    }
    return { fetchedAt: parsed.fetchedAt, models: sanitizeCachedModels(parsed.models) }
  } catch {
    // No cache yet or unreadable cache: a fresh download will replace it
    return null
  }
}

async function downloadSnapshot(cacheDir: string): Promise<CatalogSnapshot | null> {
  let next: CatalogSnapshot
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
    if (!res.ok) {
      console.error('[models] catalog download failed:', res.status)
      return null
    }
    const models = parseCatalog(await res.json())
    if (CATALOG_PROVIDERS.every((p) => models[p].length === 0)) {
      console.error('[models] catalog download had no usable models')
      return null
    }
    next = { fetchedAt: Date.now(), models }
  } catch (error) {
    console.error(
      '[models] catalog download failed:',
      error instanceof Error ? error.message : error
    )
    return null
  }

  try {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, CATALOG_FILE), JSON.stringify(next), 'utf8')
  } catch (error) {
    console.error(
      '[models] catalog cache write failed:',
      error instanceof Error ? error.message : error
    )
  }
  return next
}

/**
 * Returns the newest-first catalog models for a provider. Serves the cached
 * snapshot while it is fresh; `refresh` forces a re-download. When offline,
 * a stale snapshot is used, and an empty list means the caller should fall back.
 */
export async function getCatalogModels(
  provider: CatalogProvider,
  cacheDir: string,
  refresh = false
): Promise<readonly ModelOption[]> {
  if (!snapshot) {
    snapshot = await readSnapshot(cacheDir)
  }

  const isFresh = snapshot !== null && Date.now() - snapshot.fetchedAt < CATALOG_TTL_MS
  if (refresh || !isFresh) {
    // One shared download, even when every provider is requested at once
    inFlight ??= downloadSnapshot(cacheDir).finally(() => {
      inFlight = null
    })
    snapshot = (await inFlight) ?? snapshot
  }

  return snapshot?.models[provider] ?? []
}

export function isCatalogProvider(provider: ProviderId): provider is CatalogProvider {
  return provider in CATALOG_KEYS
}
