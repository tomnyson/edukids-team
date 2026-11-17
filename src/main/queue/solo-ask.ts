/**
 * The pure half of a solo ask: field checks at the IPC boundary, and how a queued prompt's end
 * becomes the envelope `ask` resolves with. Attachments touch the disk, so the IPC layer checks
 * them. Relative imports only, so tests load it without a bundler.
 */
import { LIMITS } from '../../shared/ipc'
import { MAX_QUEUED, isConversationId } from '../../shared/queue'
import { isEffortId, isModelId } from '../../shared/types'
import type { AppError, EffortId, ModelId, Result } from '../../shared/types'
import type { Settled } from './runner'

export interface SoloFields {
  readonly conversationId: number
  readonly prompt: string
  readonly model: ModelId | null
  readonly effort: EffortId | null
}

const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: 'INVALID_INPUT', message }
})

/** Everything but attachments; the request is whatever the renderer sent. */
export function checkSoloFields(request: unknown): Result<SoloFields> {
  const raw = (typeof request === 'object' && request !== null ? request : {}) as Record<
    string,
    unknown
  >
  if (!isConversationId(raw.conversationId)) return invalid('That conversation id is not valid.')

  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return invalid('Type something first.')
  if (prompt.length > LIMITS.promptMaxLength) {
    return invalid(
      `That prompt is too long (limit ${LIMITS.promptMaxLength.toLocaleString()} characters).`
    )
  }

  // Both end up in argv, so neither is taken on trust
  const model = raw.model ?? null
  if (model !== null && !isModelId(model)) return invalid(`Unknown model: ${String(model)}`)

  // A bad --effort does not fail the run: the CLI warns and quietly uses its default, so the
  // app would record a level that never ran. Stop it here.
  const effort = raw.effort ?? null
  if (effort !== null && !isEffortId(effort)) return invalid(`Unknown effort: ${String(effort)}`)

  return { ok: true, data: { conversationId: raw.conversationId, prompt, model, effort } }
}

/** What `ask` resolves with once its prompt has left the queue, run or not. */
export function resultFromSettled<T>(settled: Settled<Result<T>>): Result<T> {
  if (settled.value) return settled.value
  if (settled.outcome === 'cancelled') {
    return {
      ok: false,
      error: { code: 'CANCELLED', message: 'Removed from the queue before it ran.' }
    }
  }
  const detail = settled.error instanceof Error ? settled.error.message : String(settled.error)
  return {
    ok: false,
    error: { code: 'UNKNOWN', message: 'Something went wrong inside the app.', detail }
  }
}

/** Why a prompt could not join the queue. */
export function refusalError(reason: 'full' | 'closed'): AppError {
  return reason === 'full'
    ? {
        code: 'INVALID_INPUT',
        message: `The queue is full (limit ${MAX_QUEUED} prompts). Wait for one to finish or remove one.`
      }
    : { code: 'CANCELLED', message: 'The app is closing.' }
}
