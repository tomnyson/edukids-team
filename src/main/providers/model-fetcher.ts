import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ModelOption, ProviderId } from '@shared/types'
import { resolveOpencodeBinary } from './opencode-environment'
import { getEnrichedPath } from '../claude/environment'

const execFileAsync = promisify(execFile)

const PRESET_MODELS: Record<ProviderId, readonly ModelOption[]> = {
  opencode: [
    { id: 'opencode/mimo-v2.6-flash-free', name: 'Mimo v2.6 Flash Free', free: true, reasoning: true, provider: 'opencode' },
    { id: 'opencode/nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning Free', free: true, reasoning: true, provider: 'opencode' },
    { id: 'opencode/step-5-preview-free', name: 'Step 5 Preview Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/exo-free', name: 'Exo Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/ling-3.1-flash-free', name: 'Ling 3.1 Flash Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/big-pickle', name: 'Big Pickle Free', free: true, reasoning: false, provider: 'opencode' },
    { id: 'opencode/longcat-2.5-preview-free', name: 'Longcat 2.5 Preview Free', free: true, reasoning: false, provider: 'opencode' }
  ],
  xai: [
    { id: 'grok-3', name: 'Grok 3 (Deep Thinking)', free: false, reasoning: true, provider: 'xai' },
    { id: 'grok-2-1212', name: 'Grok 2 (State of the Art)', free: false, reasoning: false, provider: 'xai' },
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision', free: false, reasoning: false, provider: 'xai' },
    { id: 'grok-beta', name: 'Grok Beta', free: false, reasoning: false, provider: 'xai' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Hybrid Thinking)', free: false, reasoning: true, provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', free: false, reasoning: false, provider: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', free: false, reasoning: false, provider: 'anthropic' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', free: false, reasoning: false, provider: 'anthropic' }
  ],
  deepseek: [
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoning CoT)', free: false, reasoning: true, provider: 'deepseek' },
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', free: false, reasoning: false, provider: 'deepseek' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', free: false, reasoning: false, provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', free: false, reasoning: false, provider: 'openai' },
    { id: 'o3-mini', name: 'o3-mini (High Reasoning)', free: false, reasoning: true, provider: 'openai' },
    { id: 'o1', name: 'o1 (Deep Reasoning)', free: false, reasoning: true, provider: 'openai' }
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', free: false, reasoning: false, provider: 'gemini' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental', free: false, reasoning: true, provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', free: false, reasoning: false, provider: 'gemini' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', free: false, reasoning: false, provider: 'gemini' }
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2 (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'mistral', name: 'Mistral 7B (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder (Local)', free: true, reasoning: false, provider: 'ollama' },
    { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B (Local Reasoning)', free: true, reasoning: true, provider: 'ollama' }
  ],
  openrouter: [
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', free: true, reasoning: true, provider: 'openrouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', free: true, reasoning: false, provider: 'openrouter' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', free: true, reasoning: false, provider: 'openrouter' },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', free: false, reasoning: true, provider: 'openrouter' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', free: false, reasoning: false, provider: 'openrouter' }
  ]
}

export async function fetchModelsForProvider(
  provider: ProviderId,
  apiKey?: string,
  baseUrl?: string
): Promise<readonly ModelOption[]> {
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
        const url = (baseUrl?.trim() || 'http://localhost:11434').replace(/\/+$/, '')
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
        if (!res.ok) return PRESET_MODELS.ollama
        const data = (await res.json()) as { models?: Array<{ name: string }> }
        if (!data.models || data.models.length === 0) return PRESET_MODELS.ollama
        return data.models.map((m) => ({
          id: m.name,
          name: `${m.name} (Local)`,
          free: true,
          reasoning: m.name.includes('r1') || m.name.includes('reason'),
          provider: 'ollama'
        }))
      }

      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return PRESET_MODELS.openrouter
        const data = (await res.json()) as {
          data?: Array<{ id: string; name: string; pricing?: { prompt?: string } }>
        }
        if (!data.data || data.data.length === 0) return PRESET_MODELS.openrouter
        return data.data.slice(0, 100).map((m) => {
          const isFree = m.id.endsWith(':free') || m.pricing?.prompt === '0'
          return {
            id: m.id,
            name: `${m.name || m.id}${isFree ? ' [FREE]' : ''}`,
            free: isFree,
            reasoning: m.id.includes('r1') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('thinking'),
            provider: 'openrouter'
          }
        })
      }

      case 'openai': {
        if (!apiKey) return PRESET_MODELS.openai
        const url = (baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
        const res = await fetch(`${url}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(4000)
        })
        if (!res.ok) return PRESET_MODELS.openai
        const data = (await res.json()) as { data?: Array<{ id: string }> }
        if (!data.data) return PRESET_MODELS.openai
        const chatModels = data.data
          .filter((m) => m.id.includes('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .sort((a, b) => a.id.localeCompare(b.id))
        return chatModels.map((m) => ({
          id: m.id,
          name: m.id,
          free: false,
          reasoning: m.id.startsWith('o1') || m.id.startsWith('o3'),
          provider: 'openai'
        }))
      }

      case 'xai': {
        if (!apiKey) return PRESET_MODELS.xai
        const url = (baseUrl?.trim() || 'https://api.x.ai/v1').replace(/\/+$/, '')
        const res = await fetch(`${url}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(4000)
        })
        if (!res.ok) return PRESET_MODELS.xai
        const data = (await res.json()) as { data?: Array<{ id: string }> }
        if (!data.data) return PRESET_MODELS.xai
        return data.data.map((m) => ({
          id: m.id,
          name: m.id,
          free: false,
          reasoning: m.id.includes('grok-3'),
          provider: 'xai'
        }))
      }

      case 'deepseek': {
        if (!apiKey) return PRESET_MODELS.deepseek
        const url = (baseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
        const res = await fetch(`${url}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(4000)
        })
        if (!res.ok) return PRESET_MODELS.deepseek
        const data = (await res.json()) as { data?: Array<{ id: string }> }
        if (!data.data) return PRESET_MODELS.deepseek
        return data.data.map((m) => ({
          id: m.id,
          name: m.id,
          free: false,
          reasoning: m.id.includes('reasoner'),
          provider: 'deepseek'
        }))
      }

      case 'anthropic': {
        return PRESET_MODELS.anthropic
      }

      case 'gemini': {
        if (!apiKey) return PRESET_MODELS.gemini
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { signal: AbortSignal.timeout(4000) }
        )
        if (!res.ok) return PRESET_MODELS.gemini
        const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string }> }
        if (!data.models) return PRESET_MODELS.gemini
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

      default:
        return []
    }
  } catch {
    // If any network call or CLI call fails, gracefully return the preset models
    return PRESET_MODELS[provider] ?? []
  }
}
