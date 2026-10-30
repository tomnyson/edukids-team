import type { ModelOption } from '@shared/types'

/**
 * Parsers for the Codex CLI (`codex`): its `codex exec --json` events and its
 * `codex debug models` listing.
 *
 * Kept free of Electron imports so tests can load it directly under Node.
 */

export type CodexEvent =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'usage'; readonly tokensUsed: number }
  | { readonly kind: 'error'; readonly message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Codex reports API failures as a JSON string; pull out the human message when it is one
function unwrapErrorMessage(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message)
    if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }
  } catch {
    // Plain-text message
  }
  return message
}

function parseUsage(usage: unknown): CodexEvent | null {
  if (!isRecord(usage)) return null
  const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0
  const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0
  return { kind: 'usage', tokensUsed: input + output }
}

/**
 * Parses one JSONL line of `codex exec --json` output. Only agent messages, the
 * turn's token usage, and fatal errors yield events. `item.type: "error"` items
 * are config warnings that do not stop the turn, so they yield null.
 */
export function parseCodexLine(line: string): CodexEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  switch (parsed.type) {
    case 'item.completed': {
      const item = parsed.item
      return isRecord(item) && item.type === 'agent_message' && typeof item.text === 'string'
        ? { kind: 'message', text: item.text }
        : null
    }
    case 'turn.completed':
      return parseUsage(parsed.usage)
    case 'turn.failed': {
      const error = parsed.error
      return isRecord(error) && typeof error.message === 'string'
        ? { kind: 'error', message: unwrapErrorMessage(error.message) }
        : { kind: 'error', message: 'turn failed' }
    }
    case 'error':
      return typeof parsed.message === 'string'
        ? { kind: 'error', message: unwrapErrorMessage(parsed.message) }
        : null
    default:
      return null
  }
}

/** Models the signed-in Codex account can pick, from `codex debug models`, in Codex's own order. */
export function parseCodexModels(stdout: string): readonly ModelOption[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.models)) return []

  return parsed.models
    .filter(
      (m): m is Record<string, unknown> =>
        isRecord(m) && m.visibility === 'list' && typeof m.slug === 'string'
    )
    .toSorted((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .map((m) => {
      const id = m.slug as string
      const name = typeof m.display_name === 'string' ? m.display_name : id
      return { id, name: `${name} (Codex CLI)`, free: true, reasoning: true, provider: 'openai' }
    })
}
