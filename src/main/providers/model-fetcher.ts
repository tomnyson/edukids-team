import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import type { ModelOption, ProviderId } from '@shared/types'
import { resolveCliBinary } from './cli-binary'
import { getEnrichedPath } from '../claude/environment'
import { getCatalogModels, rankByCatalog, type CatalogProvider } from './model-catalog'
import { parseAgyGeminiModels } from './agy-stream'
import { parseCodexModels } from './codex-stream'

const execFileAsync = promisify(execFile)

export const PRESET_MODELS: Record<ProviderId, readonly ModelOption[]> = {
  opencode: [
    { id: 'opencode/mimo-v2.6-flash-free', name: 'Mimo v2.6 Flash Free', free: true, reasoning: true, provider: 'opencode' },
    { id: 'opencode/nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning Free', free: true, reasoning: true, provider: 'opencode' },
    { id: 'opencode/step-5-preview-free', name: 'Step 5 Preview Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/beam-free', name: 'Beam Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/deepseek-v4.1-flash-free', name: 'DeepSeek v4.1 Flash Free', free: true, reasoning: true, provider: 'opencode' },
    { id: 'opencode/glm-5.3-flash-free', name: 'GLM 5.3 Flash Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/longcat-2.5-preview-free', name: 'Longcat 2.5 Preview Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/space-bunny-free', name: 'Space Bunny Free', free: true, reasoning: false, provider: 'opencode' }
  ],
  xai: [
    { id: 'grok-4.7', name: 'Grok 4.7', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-4.6', name: 'Grok 4.6', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-4.5', name: 'Grok 4.5', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-build-0.1', name: 'Grok Build 0.1', free: false, reasoning: true, provider: 'xai' }
  ],
  anthropic: [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-opus-5', name: 'Claude Opus 5', free: false, reasoning: true, provider: 'anthropic' }
  ],
  deepseek: [
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', free: false, reasoning: true, provider: 'deepseek' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', free: false, reasoning: true, provider: 'deepseek' }
  ],
  openai: [
    { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', free: false, reasoning: true, provider: 'openai' },
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', free: false, reasoning: true, provider: 'openai' },
    { id: 'gpt-6-sol', name: 'GPT-6 Sol', free: false, reasoning: true, provider: 'openai' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', free: false, reasoning: true, provider: 'openai' },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', free: false, reasoning: true, provider: 'openai' },
    { id: 'gpt-5.6', name: 'GPT-5.6', free: false, reasoning: true, provider: 'openai' }
  ],
  gemini: [
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', free: false, reasoning: true, provider: 'gemini' }
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2 (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'mistral', name: 'Mistral 7B (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B (Local Reasoning)', free: true, reasoning: true, provider: 'ollama' }
  ],
  openrouter: [
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (Free)', free: true, reasoning: true, provider: 'openrouter' },
    { id: 'recursive/flint-v1.0:free', name: 'Flint (Free)', free: true, reasoning: true, provider: 'openrouter' },
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'x-ai/grok-4.7', name: 'Grok 4.7', free: false, reasoning: true, provider: 'openrouter' }
  ]
}

/** Saved key, else the provider's env var. The gateway uses the same rule to pick a backend. */
export function resolveEffectiveApiKey(provider: ProviderId, explicitKey?: string): string | undefined {
  if (explicitKey?.trim()) return explicitKey.trim()

  const envMap: Record<ProviderId, string | undefined> = {
    xai: process.env.XAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    ollama: undefined,
    opencode: undefined
  }

  return envMap[provider]?.trim() || undefined
}

const LIVE_TIMEOUT_MS = 4000

// OpenAI lists every model family; keep the ones usable for chat
const OPENAI_CHAT_PREFIX = /^(gpt|chatgpt|o\d)/
const OPENAI_NON_CHAT =
  /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search)/

type LiveFetcher = (apiKey: string, baseUrl?: string) => Promise<readonly ModelOption[]>

function apiBase(baseUrl: string | undefined, fallback: string): string {
  return (baseUrl?.trim() || fallback).replace(/\/+$/, '')
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) })
  return res.ok ? ((await res.json()) as T) : null
}

function openAiCompatibleFetcher(provider: CatalogProvider, defaultBase: string): LiveFetcher {
  return async (apiKey, baseUrl) => {
    const data = await getJson<{ data?: Array<{ id: string }> }>(
      `${apiBase(baseUrl, defaultBase)}/models`,
      { Authorization: `Bearer ${apiKey}` }
    )
    return (data?.data ?? []).map((m): ModelOption => ({
      id: m.id,
      name: m.id,
      free: false,
      reasoning: false,
      provider
    }))
  }
}

const LIVE_FETCHERS: Record<CatalogProvider, LiveFetcher> = {
  anthropic: async (apiKey, baseUrl) => {
    const data = await getJson<{ data?: Array<{ id: string; display_name?: string }> }>(
      `${apiBase(baseUrl, 'https://api.anthropic.com/v1')}/models?limit=1000`,
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    )
    return (data?.data ?? []).map((m): ModelOption => ({
      id: m.id,
      name: m.display_name || m.id,
      free: false,
      reasoning: false,
      provider: 'anthropic'
    }))
  },

  openai: async (apiKey, baseUrl) => {
    const data = await getJson<{ data?: Array<{ id: string; created?: number }> }>(
      `${apiBase(baseUrl, 'https://api.openai.com/v1')}/models`,
      { Authorization: `Bearer ${apiKey}` }
    )
    return (data?.data ?? [])
      .filter((m) => OPENAI_CHAT_PREFIX.test(m.id) && !OPENAI_NON_CHAT.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m): ModelOption => ({
        id: m.id,
        name: m.id,
        free: false,
        reasoning: /^o\d/.test(m.id),
        provider: 'openai'
      }))
  },

  gemini: async (apiKey) => {
    const data = await getJson<{
      models?: Array<{
        name: string
        displayName?: string
        thinking?: boolean
        supportedGenerationMethods?: string[]
      }>
    }>('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      'x-goog-api-key': apiKey
    })
    return (data?.models ?? [])
      .filter(
        (m) =>
          m.name.includes('gemini') &&
          (m.supportedGenerationMethods?.includes('generateContent') ?? true)
      )
      .map((m): ModelOption => {
        const id = m.name.replace(/^models\//, '')
        return {
          id,
          name: m.displayName || id,
          free: false,
          reasoning: m.thinking === true,
          provider: 'gemini'
        }
      })
  },

  xai: openAiCompatibleFetcher('xai', 'https://api.x.ai/v1'),
  deepseek: openAiCompatibleFetcher('deepseek', 'https://api.deepseek.com/v1')
}

// Models the local Grok CLI has seen, from ~/.grok/models_cache.json
function readGrokCliModels(): readonly ModelOption[] {
  try {
    const grokCachePath = join(homedir(), '.grok', 'models_cache.json')
    if (!existsSync(grokCachePath)) return []
    const cache = JSON.parse(readFileSync(grokCachePath, 'utf8')) as {
      models?: Record<string, { info?: { name?: string } }>
    }
    return Object.entries(cache.models ?? {}).map(([id, m]): ModelOption => ({
      id,
      name: `${m.info?.name || id} (Local Grok CLI)`,
      free: false,
      reasoning: false,
      provider: 'xai'
    }))
  } catch {
    // ignore cache read failure
    return []
  }
}

let agyModelsPromise: Promise<readonly ModelOption[]> | null = null

/** Gemini models the Antigravity CLI can run; empty when agy is missing or fails. */
function fetchAgyGeminiModels(refresh: boolean): Promise<readonly ModelOption[]> {
  if (refresh || !agyModelsPromise) {
    agyModelsPromise = (async () => {
      const binary = await resolveCliBinary('agy')
      if (!binary) return []

      const { stdout } = await execFileAsync(binary, ['models'], {
        env: { ...process.env, PATH: await getEnrichedPath() },
        encoding: 'utf8',
        timeout: 15000
      })
      return parseAgyGeminiModels(stdout)
    })().catch((error) => {
      console.error(
        '[models] agy model list failed:',
        error instanceof Error ? error.message : error
      )
      agyModelsPromise = null
      return []
    })
  }
  return agyModelsPromise
}

let codexModelsPromise: Promise<readonly ModelOption[]> | null = null

/** Models the Codex CLI's signed-in account can run; empty when codex is missing or fails. */
function fetchCodexModels(refresh: boolean): Promise<readonly ModelOption[]> {
  if (refresh || !codexModelsPromise) {
    codexModelsPromise = (async () => {
      const binary = await resolveCliBinary('codex')
      if (!binary) return []

      const { stdout } = await execFileAsync(binary, ['debug', 'models'], {
        env: { ...process.env, PATH: await getEnrichedPath() },
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024
      })
      return parseCodexModels(stdout)
    })().catch((error) => {
      console.error(
        '[models] codex model list failed:',
        error instanceof Error ? error.message : error
      )
      codexModelsPromise = null
      return []
    })
  }
  return codexModelsPromise
}

/**
 * Hosted providers: the live API list when a key works (ranked newest-first),
 * otherwise the keyless models.dev catalog, otherwise the bundled presets.
 */
async function fetchHostedModels(
  provider: CatalogProvider,
  apiKey: string | undefined,
  baseUrl: string | undefined,
  refresh: boolean
): Promise<readonly ModelOption[]> {
  const fetchLive = async (key: string): Promise<readonly ModelOption[]> => {
    try {
      return await LIVE_FETCHERS[provider](key, baseUrl)
    } catch (error) {
      console.error(
        `[models] ${provider} model list failed:`,
        error instanceof Error ? error.message : error
      )
      return []
    }
  }

  const [catalog, live] = await Promise.all([
    getCatalogModels(provider, app.getPath('userData'), refresh),
    apiKey ? fetchLive(apiKey) : Promise.resolve([])
  ])

  if (live.length > 0) return rankByCatalog(live, catalog)

  const grokCli = provider === 'xai' ? readGrokCliModels() : []
  const fallback = [...catalog, ...grokCli.filter((m) => !catalog.some((c) => c.id === m.id))]
  return fallback.length > 0 ? fallback : PRESET_MODELS[provider]
}

export async function fetchModelsForProvider(
  provider: ProviderId,
  apiKey?: string,
  baseUrl?: string,
  refresh = false
): Promise<readonly ModelOption[]> {
  const effectiveKey = resolveEffectiveApiKey(provider, apiKey)

  try {
    switch (provider) {
      case 'opencode': {
        const binary = await resolveCliBinary('opencode')
        if (!binary) return PRESET_MODELS.opencode

        const pathEnv = await getEnrichedPath()
        const { stdout } = await execFileAsync(binary, ['models'], {
          env: { ...process.env, PATH: pathEnv },
          encoding: 'utf8',
          timeout: 8000
        })

        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
        if (lines.length === 0) return PRESET_MODELS.opencode

        return lines.map((modelId) => {
          const isFree = modelId.includes('free') || modelId.startsWith('opencode/')
          const parts = modelId.split('/')
          const rawName = parts[parts.length - 1]
          const cleanName = rawName
            .replace(/-free$/, '')
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')

          return {
            id: modelId,
            name: `${cleanName} ${isFree ? '(Free)' : ''}`.trim(),
            free: isFree,
            reasoning: isFree,
            provider: 'opencode'
          }
        })
      }

      case 'ollama': {
        const localModels: ModelOption[] = []

        // 1. Probe Ollama (default 11434 or custom baseUrl)
        const ollamaUrl = (baseUrl?.trim() || 'http://localhost:11434').replace(/\/+$/, '')
        try {
          const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) })
          if (res.ok) {
            const data = (await res.json()) as { models?: Array<{ name: string }> }
            if (data.models && data.models.length > 0) {
              for (const m of data.models) {
                localModels.push({
                  id: m.name,
                  name: `${m.name} (Ollama)`,
                  free: true,
                  reasoning: m.name.includes('r1') || m.name.includes('reason'),
                  provider: 'ollama'
                })
              }
            }
          }
        } catch {
          // Ollama not reachable, continue to probe LM Studio
        }

        // 2. Probe LM Studio (default 1234)
        try {
          const lmStudioUrl = 'http://localhost:1234/v1'
          const res = await fetch(`${lmStudioUrl}/models`, { signal: AbortSignal.timeout(2000) })
          if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id: string }> }
            if (data.data && data.data.length > 0) {
              for (const m of data.data) {
                if (!m.id.includes('embed') && !localModels.some((lm) => lm.id === m.id)) {
                  localModels.push({
                    id: m.id,
                    name: `${m.id} (LM Studio)`,
                    free: true,
                    reasoning: m.id.includes('r1') || m.id.includes('reason') || m.id.includes('thinking'),
                    provider: 'ollama'
                  })
                }
              }
            }
          }
        } catch {
          // LM Studio not reachable
        }

        return localModels.length > 0 ? localModels : PRESET_MODELS.ollama
      }

      case 'openrouter': {
        const headers: Record<string, string> = {
          'User-Agent': 'ClaudeGUI/0.1.0'
        }
        if (effectiveKey) {
          headers['Authorization'] = `Bearer ${effectiveKey}`
        }

        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers,
          signal: AbortSignal.timeout(6000)
        })
        if (!res.ok) return PRESET_MODELS.openrouter

        const data = (await res.json()) as {
          data?: Array<{ id: string; name: string; pricing?: { prompt?: string } }>
        }
        if (!data.data || data.data.length === 0) return PRESET_MODELS.openrouter

        // Split into free models and paid models
        const freeModels: ModelOption[] = []
        const paidModels: ModelOption[] = []

        for (const m of data.data) {
          const isFree = m.id.endsWith(':free') || m.pricing?.prompt === '0'
          const option: ModelOption = {
            id: m.id,
            name: `${m.name || m.id} ${isFree ? '[FREE]' : ''}`.trim(),
            free: isFree,
            reasoning:
              m.id.includes('r1') ||
              m.id.includes('o1') ||
              m.id.includes('o3') ||
              m.id.includes('thinking') ||
              m.id.includes('reasoner'),
            provider: 'openrouter'
          }

          if (isFree) {
            freeModels.push(option)
          } else {
            paidModels.push(option)
          }
        }

        // Return free models first, then paid models
        return [...freeModels, ...paidModels]
      }

      case 'gemini': {
        // Without a key, Gemini runs through the Antigravity CLI, so list what agy can run
        if (!effectiveKey) {
          const agyModels = await fetchAgyGeminiModels(refresh)
          if (agyModels.length > 0) return agyModels
        }
        return await fetchHostedModels(provider, effectiveKey, baseUrl, refresh)
      }

      case 'openai': {
        // Without a key, OpenAI runs through the Codex CLI, so list what codex can run
        if (!effectiveKey) {
          const codexModels = await fetchCodexModels(refresh)
          if (codexModels.length > 0) return codexModels
        }
        return await fetchHostedModels(provider, effectiveKey, baseUrl, refresh)
      }

      case 'xai':
      case 'anthropic':
      case 'deepseek':
        return await fetchHostedModels(provider, effectiveKey, baseUrl, refresh)

      default:
        return []
    }
  } catch {
    return PRESET_MODELS[provider] ?? []
  }
}
