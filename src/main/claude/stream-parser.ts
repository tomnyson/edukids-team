/**
 * Incremental NDJSON reader for `claude --output-format stream-json`.
 *
 * The CLI emits one JSON object per line, but chunk boundaries fall anywhere,
 * and single lines can exceed a chunk. This buffers until a newline and skips
 * unparsable lines rather than failing the whole run.
 */
export class NdjsonParser {
  private buffer = ''

  push(chunk: string): readonly unknown[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    return lines.map(parseLine).filter((value): value is unknown => value !== undefined)
  }

  /** Flushes a trailing line left without a newline at process exit. */
  flush(): readonly unknown[] {
    const rest = this.buffer.trim()
    this.buffer = ''
    if (!rest) return []
    const parsed = parseLine(rest)
    return parsed === undefined ? [] : [parsed]
  }
}

function parseLine(line: string): unknown {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/** Narrowed shapes of the stream-json events this app reacts to. */
export interface ParsedEvents {
  readonly textDelta?: string
  readonly toolName?: string
  readonly result?: {
    readonly text: string
    readonly isError: boolean
    readonly durationMs: number | null
    readonly costUsd: number | null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function interpret(event: unknown): ParsedEvents {
  if (!isRecord(event)) return {}

  if (event.type === 'stream_event' && isRecord(event.event)) {
    const inner = event.event

    if (inner.type === 'content_block_delta' && isRecord(inner.delta)) {
      const delta = inner.delta
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return { textDelta: delta.text }
      }
    }

    if (inner.type === 'content_block_start' && isRecord(inner.content_block)) {
      const block = inner.content_block
      if (block.type === 'tool_use' && typeof block.name === 'string') {
        return { toolName: block.name }
      }
    }
    return {}
  }

  if (event.type === 'result') {
    return {
      result: {
        text: typeof event.result === 'string' ? event.result : '',
        isError: event.is_error === true,
        durationMs: typeof event.duration_ms === 'number' ? event.duration_ms : null,
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null
      }
    }
  }

  return {}
}
