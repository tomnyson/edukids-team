import type { ModelOption } from '@shared/types'

/**
 * Parsers for the Antigravity CLI (`agy`): its `--output-format stream-json`
 * events and its `agy models` listing.
 *
 * Kept free of Electron imports so tests can load it directly under Node.
 */

export type AgyEvent =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'result'; readonly response: string; readonly tokensUsed?: number }
  | { readonly kind: 'error'; readonly message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseResult(result: Record<string, unknown>): AgyEvent {
  if (result.status !== 'SUCCESS') {
    const message =
      typeof result.error === 'string' && result.error
        ? result.error
        : `agy finished with status ${String(result.status)}`
    return { kind: 'error', message }
  }

  const response = typeof result.response === 'string' ? result.response : ''
  const denied = deniedToolNames(result.denied_actions)
  // Headless agy auto-denies tool calls; when the agent gave up on one it ends with no text
  if (!response.trim() && denied.length > 0) {
    return {
      kind: 'error',
      message: `no reply: the agent tried tools that were blocked (${denied.join(', ')})`
    }
  }

  const total = isRecord(result.usage) ? result.usage.total_tokens : undefined
  return {
    kind: 'result',
    response,
    tokensUsed: typeof total === 'number' ? total : undefined
  }
}

function deniedToolNames(actions: unknown): readonly string[] {
  if (!Array.isArray(actions)) return []
  return actions.flatMap((action): string[] => {
    if (!isRecord(action)) return []
    const name = action.display_name ?? action.action
    return typeof name === 'string' ? [name] : []
  })
}

/** Parses one NDJSON line of agy output. Events other than reply text and the final result yield null. */
export function parseAgyLine(line: string): AgyEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const step = parsed.step_update
  if (parsed.event === 'step_update' && isRecord(step)) {
    const text = step.text_delta
    return step.step_type === 'agent_response' && typeof text === 'string' && text
      ? { kind: 'delta', text }
      : null
  }

  if (parsed.event === 'result' && isRecord(parsed.result)) {
    return parseResult(parsed.result)
  }
  return null
}

/** Gemini models from `agy models`, which prints one `<id>\t<name>` line per model. */
export function parseAgyGeminiModels(stdout: string): readonly ModelOption[] {
  return stdout.split('\n').flatMap((line): ModelOption[] => {
    const [id, name] = line.trim().split('\t')
    return id.startsWith('gemini') && name
      ? [{ id, name: `${name} (Antigravity CLI)`, free: true, reasoning: true, provider: 'gemini' }]
      : []
  })
}
