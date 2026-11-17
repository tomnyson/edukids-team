/**
 * The OpenAI-compatible chat stream (SSE), parsed without touching the network: text goes in as
 * it arrives, events come out. Reasoning reaches us two ways, as its own `reasoning_content`
 * field or as `<think>` tags inside the content, and both come out as `reasoning` events.
 */

export type OpenAIStreamEvent =
  | { readonly type: 'reasoning'; readonly text: string }
  | { readonly type: 'content'; readonly text: string }
  | { readonly type: 'usage'; readonly totalTokens: number }

export interface OpenAIStreamState {
  /** The tail of the last chunk that has no newline yet. */
  readonly buffer: string
  /** Inside a `<think>` block that a later delta closes. */
  readonly inThink: boolean
}

export interface OpenAIStreamStep {
  readonly state: OpenAIStreamState
  readonly events: readonly OpenAIStreamEvent[]
}

export const INITIAL_STREAM_STATE: OpenAIStreamState = { buffer: '', inThink: false }

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const DATA_PREFIX = 'data:'
const DONE = '[DONE]'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

interface ThinkSplit {
  readonly inThink: boolean
  readonly events: readonly OpenAIStreamEvent[]
}

/** Splits one content delta at its think tags. A tag cut across two deltas is not recognised. */
function splitThink(text: string, inThink: boolean): ThinkSplit {
  const tag = inThink ? THINK_CLOSE : THINK_OPEN
  const at = text.indexOf(tag)
  const piece = at === -1 ? text : text.slice(0, at)
  const here: readonly OpenAIStreamEvent[] = piece
    ? [{ type: inThink ? 'reasoning' : 'content', text: piece }]
    : []
  if (at === -1) return { inThink, events: here }

  const rest = splitThink(text.slice(at + tag.length), !inThink)
  return { inThink: rest.inThink, events: [...here, ...rest.events] }
}

function usageEvent(usage: unknown): readonly OpenAIStreamEvent[] {
  if (!isRecord(usage)) return []
  const { total_tokens: total, prompt_tokens: prompt, completion_tokens: completion } = usage
  if (typeof total === 'number') return [{ type: 'usage', totalTokens: total }]
  if (typeof prompt === 'number' && typeof completion === 'number') {
    return [{ type: 'usage', totalTokens: prompt + completion }]
  }
  return []
}

/** One SSE line: comments, other fields, `[DONE]` and malformed JSON all produce nothing. */
function parseLine(line: string, inThink: boolean): ThinkSplit {
  const nothing: ThinkSplit = { inThink, events: [] }
  const trimmed = line.trim()
  if (!trimmed.startsWith(DATA_PREFIX)) return nothing
  const data = trimmed.slice(DATA_PREFIX.length).trim()
  if (!data || data === DONE) return nothing

  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return nothing
  }
  if (!isRecord(json)) return nothing

  const choice: unknown = Array.isArray(json.choices) ? json.choices[0] : undefined
  const delta = isRecord(choice) && isRecord(choice.delta) ? choice.delta : {}
  const reasoning: readonly OpenAIStreamEvent[] =
    typeof delta.reasoning_content === 'string' && delta.reasoning_content
      ? [{ type: 'reasoning', text: delta.reasoning_content }]
      : []
  const content = typeof delta.content === 'string' ? splitThink(delta.content, inThink) : nothing

  return {
    inThink: content.inThink,
    events: [...reasoning, ...content.events, ...usageEvent(json.usage)]
  }
}

/** Takes the next piece of the response body; returns the new state and what it completed. */
export function feedOpenAIStream(state: OpenAIStreamState, chunk: string): OpenAIStreamStep {
  const lines = (state.buffer + chunk).split('\n')
  const buffer = lines.at(-1) ?? ''

  return lines.slice(0, -1).reduce<OpenAIStreamStep>(
    (step, line) => {
      const parsed = parseLine(line, step.state.inThink)
      return {
        state: { buffer, inThink: parsed.inThink },
        events: [...step.events, ...parsed.events]
      }
    },
    { state: { buffer, inThink: state.inThink }, events: [] }
  )
}
