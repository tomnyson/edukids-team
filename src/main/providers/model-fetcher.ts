import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ModelOption, ProviderId } from '@shared/types'
import { resolveOpencodeBinary } from './opencode-environment'
import { getEnrichedPath } from '../claude/environment'

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
    { id: 'grok-3', name: 'Grok 3 (Deep Thinking)', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-3-mini', name: 'Grok 3 Mini (Fast Thinking)', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-2-1212', name: 'Grok 2 (State of the Art)', free: false, reasoning: false, provider: 'xai' },
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision', free: false, reasoning: false, provider: 'xai' },
    { id: 'grok-beta', name: 'Grok Beta', free: false, reasoning: false, provider: 'xai' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Hybrid Thinking)', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', free: false, reasoning: false, provider: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', free: false, reasoning: false, provider: 'anthropic' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', free: false, reasoning: false, provider: 'anthropic' }
  ],
  deepseek: [
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoning CoT)', free: false, reasoning: true, provider: 'deepseek' },
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', free: false, reasoning: false, provider: 'deepseek' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)', free: false, reasoning: false, provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)', free: false, reasoning: false, provider: 'openai' },
    { id: 'o3-mini', name: 'o3-mini (High Reasoning)', free: false, reasoning: true, provider: 'openai' },
    { id: 'o1', name: 'o1 (Deep Reasoning)', free: false, reasoning: true, provider: 'openai' },
    { id: 'o1-mini', name: 'o1-mini', free: false, reasoning: true, provider: 'openai' },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', free: false, reasoning: false, provider: 'openai' }
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen)', free: false, reasoning: false, provider: 'gemini' },
    { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', free: false, reasoning: false, provider: 'gemini' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', free: false, reasoning: false, provider: 'gemini' }
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2 (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'mistral', name: 'Mistral 7B (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B (Local Reasoning)', free: true, reasoning: true, provider: 'ollama' }
  ],
  openrouter: [
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', free: true, reasoning: true, provider: 'openrouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', free: true, reasoning: false, provider: 'openrouter' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', free: true, reasoning: false, provider: 'openrouter' },
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (Free)', free: true, reasoning: true, provider: 'openrouter' },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', free: false, reasoning: false, provider: 'openrouter' }
  ]
}

function resolveEffectiveApiKey(provider: ProviderId, explicitKey?: string): string | undefined {
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

export async function fetchModelsForProvider(
  provider: ProviderId,
  apiKey?: string,
  baseUrl?: string
): Promise<readonly ModelOption[]> {
  const effectiveKey = resolveEffectiveApiKey(provider, apiKey)

  try {
    switch (provider) {
      case 'opencode': {
        const binary = await resolveOpencodeBinary()
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

      case 'xai': {
        const models: ModelOption[] = []

        // If API key is available, query real xAI API
        if (effectiveKey) {
          const url = (baseUrl?.trim() || 'https://api.x.ai/v1').replace(/\/+$/, '')
          try {
            const res = await fetch(`${url}/models`, {
              headers: { Authorization: `Bearer ${effectiveKey}` },
              signal: AbortSignal.timeout(4000)
            })
            if (res.ok) {
              const data = (await res.json()) as { data?: Array<{ id: string }> }
              if (data.data && data.data.length > 0) {
                for (const m of data.data) {
                  models.push({
                    id: m.id,
                    name: m.id,
                    free: false,
                    reasoning: m.id.includes('grok-3') || m.id.includes('thinking'),
                    provider: 'xai'
                  })
                }
                return models
              }
            }
          } catch {
            // fallback to cache or presets
          }
        }

        // Check local ~/.grok/models_cache.json
        try {
          const grokCachePath = join(homedir(), '.grok', 'models_cache.json')
          if (existsSync(grokCachePath)) {
            const cache = JSON.parse(readFileSync(grokCachePath, 'utf8')) as {
              models?: Record<string, { info?: { name?: string } }>
            }
            if (cache.models) {
              for (const [id, m] of Object.entries(cache.models)) {
                models.push({
                  id,
                  name: `${m.info?.name || id} (Local Grok CLI)`,
                  free: false,
                  reasoning: id.includes('grok-3') || id.includes('build'),
                  provider: 'xai'
                })
              }
            }
          }
        } catch {
          // ignore cache read failure
        }

        // Merge with preset models, avoiding duplicates
        for (const preset of PRESET_MODELS.xai) {
          if (!models.some((m) => m.id === preset.id)) {
            models.push(preset)
          }
        }

        return models
      }

      case 'anthropic': {
        if (effectiveKey) {
          const url = (baseUrl?.trim() || 'https://api.anthropic.com/v1').replace(/\/+$/, '')
          try {
            const res = await fetch(`${url}/models`, {
              headers: {
                'x-api-key': effectiveKey,
                'anthropic-version': '2023-06-01'
              },
              signal: AbortSignal.timeout(4000)
            })
            if (res.ok) {
              const data = (await res.json()) as {
                data?: Array<{ id: string; display_name?: string }>
              }
              if (data.data && data.data.length > 0) {
                return data.data.map((m) => ({
                  id: m.id,
                  name: m.display_name || m.id,
                  free: false,
                  reasoning: m.id.includes('3-7') || m.id.includes('thinking'),
                  provider: 'anthropic'
                }))
              }
            }
          } catch {
            // fallback to presets
          }
        }

        return PRESET_MODELS.anthropic
      }

      case 'openai': {
        if (effectiveKey) {
          const url = (baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
          try {
            const res = await fetch(`${url}/models`, {
              headers: { Authorization: `Bearer ${effectiveKey}` },
              signal: AbortSignal.timeout(4000)
            })
            if (res.ok) {
              const data = (await res.json()) as { data?: Array<{ id: string }> }
              if (data.data && data.data.length > 0) {
                return data.data
                  .filter((m) => m.id.includes('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((m) => ({
                    id: m.id,
                    name: m.id,
                    free: false,
                    reasoning: m.id.startsWith('o1') || m.id.startsWith('o3'),
                    provider: 'openai'
                  }))
              }
            }
          } catch {
            // fallback
          }
        }

        return PRESET_MODELS.openai
      }

      case 'gemini': {
        if (effectiveKey) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${effectiveKey}`,
              { signal: AbortSignal.timeout(4000) }
            )
            if (res.ok) {
              const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string }> }
              if (data.models && data.models.length > 0) {
                return data.models
                  .filter((m) => m.name.includes('gemini'))
                  .map((m) => {
                    const cleanId = m.name.replace(/^models\//, '')
                    return {
                      id: cleanId,
                      name: m.displayName || cleanId,
                      free: false,
                      reasoning: cleanId.includes('thinking') || cleanId.includes('pro-exp'),
                      provider: 'gemini'
                    }
                  })
              }
            }
          } catch {
            // fallback
          }
        }

        return PRESET_MODELS.gemini
      }

      case 'deepseek': {
        if (effectiveKey) {
          const url = (baseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
          try {
            const res = await fetch(`${url}/models`, {
              headers: { Authorization: `Bearer ${effectiveKey}` },
              signal: AbortSignal.timeout(4000)
            })
            if (res.ok) {
              const data = (await res.json()) as { data?: Array<{ id: string }> }
              if (data.data && data.data.length > 0) {
                return data.data.map((m) => ({
                  id: m.id,
                  name: m.id,
                  free: false,
                  reasoning: m.id.includes('reasoner'),
                  provider: 'deepseek'
                }))
              }
            }
          } catch {
            // fallback
          }
        }

        return PRESET_MODELS.deepseek
      }

      default:
        return []
    }
  } catch {
    return PRESET_MODELS[provider] ?? []
  }
}
