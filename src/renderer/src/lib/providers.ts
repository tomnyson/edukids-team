import type { ProviderId } from '@shared/types'

/** Every provider a model can come from, in the order the pickers list them. */
export const PROVIDER_OPTIONS: readonly { readonly id: ProviderId; readonly label: string }[] = [
  { id: 'xai', label: 'xAI Grok' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Local (Ollama / LM Studio)' },
  { id: 'opencode', label: 'OpenCode CLI' }
]
