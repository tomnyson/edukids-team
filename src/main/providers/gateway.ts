import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { getProviderConfig } from '../db/providers'
import { runOpenAICompatible } from './openai-adapter'
import { runAnthropic } from './anthropic-adapter'
import { runGemini } from './gemini-adapter'

export async function dispatchLLM(
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const config = getProviderConfig(request.provider)
  const apiKey = config?.apiKey ?? null
  const baseUrl = config?.baseUrl ?? null

  switch (request.provider) {
    case 'openai':
    case 'xai':
    case 'deepseek':
    case 'ollama':
    case 'openrouter':
      return runOpenAICompatible(apiKey ?? '', baseUrl, request, callbacks)

    case 'anthropic':
      return runAnthropic(apiKey, baseUrl, request, callbacks)

    case 'gemini':
      if (!apiKey) {
        throw new Error('Google Gemini API key is not configured in Provider Settings.')
      }
      return runGemini(apiKey, request, callbacks)

    default:
      throw new Error(`Unsupported provider: ${request.provider}`)
  }
}
