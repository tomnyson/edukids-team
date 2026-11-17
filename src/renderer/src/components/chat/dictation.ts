import type { ComposerEdit } from './mention'

/** Text the inserted words should butt up against, not be spaced away from. */
const NO_SPACE_AFTER = /^[\s.,;:!?)\]}]/
const ENDS_WITH_SPACE = /\s$/

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : max))
}

/**
 * Drops a transcript into the prompt at the caret, replacing any selection. Words are spaced
 * from their neighbours, and the caret lands right after the inserted text so the user can keep
 * typing or dictating. An empty transcript leaves the prompt untouched.
 */
export function insertDictation(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transcript: string
): ComposerEdit {
  const from = clamp(selectionStart, 0, value.length)
  const to = clamp(selectionEnd, from, value.length)
  const text = transcript.trim()
  if (!text) return { value, caret: to }

  const before = value.slice(0, from)
  const after = value.slice(to)
  const lead = before && !ENDS_WITH_SPACE.test(before) ? ' ' : ''
  const trail = after && !NO_SPACE_AFTER.test(after) ? ' ' : ''

  return {
    value: `${before}${lead}${text}${trail}${after}`,
    caret: before.length + lead.length + text.length
  }
}
