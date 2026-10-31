import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { getProviderConfig } from '../db/providers'
import { runOpenAICompatible } from './openai-adapter'
import { runAnthropic } from './anthropic-adapter'
import { runGemini } from './gemini-adapter'
import { runOpenCode } from './opencode-adapter'
import { runAgy } from './agy-adapter'
import { runCodex } from './codex-adapter'
import { forgetCliBinary, resolveCliBinary } from './cli-binary'
import { resolveEffectiveApiKey } from './model-fetcher'

export async function dispatchLLM(
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const config = getProviderConfig(request.provider)
  const apiKey = config?.apiKey ?? null
  const baseUrl = config?.baseUrl ?? null

  switch (request.provider) {
    case 'opencode':
      return runOpenCode(request, callbacks)

    case 'openai': {
      // Same key rule as the model picker, so listed model IDs match the backend
      const openaiKey = resolveEffectiveApiKey('openai', apiKey ?? undefined)
      if (openaiKey) return runOpenAICompatible(openaiKey, baseUrl, request, callbacks)

      // The path is cached for the app's lifetime; after a failure, look again next turn so a
      // reinstall or a fresh install is picked up without restarting the app
      const codexBinary = await resolveCliBinary('codex')
      if (codexBinary) {
        try {
          return await runCodex(codexBinary, request, callbacks)
        } catch (error) {
          forgetCliBinary('codex')
          throw error
        }
      }

      forgetCliBinary('codex')
      throw new Error(
        'OpenAI needs an API key in Provider Settings, or the Codex CLI (`codex`) installed and signed in.'
      )
    }

    case 'xai':
    case 'deepseek':
    case 'ollama':
    case 'openrouter':
      return runOpenAICompatible(apiKey ?? '', baseUrl, request, callbacks)

    case 'anthropic':
      return runAnthropic(apiKey, baseUrl, request, callbacks)

    case 'gemini': {
      // Same key rule as the model picker, so listed model IDs match the backend
      const geminiKey = resolveEffectiveApiKey('gemini', apiKey ?? undefined)
      if (geminiKey) return runGemini(geminiKey, request, callbacks)

      const agyBinary = await resolveCliBinary('agy')
      if (agyBinary) return runAgy(agyBinary, request, callbacks)

      throw new Error(
        'Google Gemini needs an API key in Provider Settings, or the Antigravity CLI (`agy`) installed and signed in.'
      )
    }

    default:
      throw new Error(`Unsupported provider: ${request.provider}`)
  }
}
