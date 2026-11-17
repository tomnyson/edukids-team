import type { CompanyMessage } from '@shared/types'
import type { CompanySummary } from '../db/companies'
import type { ChatMessage } from '../providers/types'

type MeetingMessage = Pick<
  CompanyMessage,
  'id' | 'senderType' | 'memberName' | 'memberRole' | 'content'
>

export interface CompactionLimits {
  /** The newest messages, up to about this many characters, are always sent word for word. */
  readonly keepRecentChars: number
  /** Older messages are condensed only once at least this much has piled up, so folds stay rare. */
  readonly foldMinChars: number
  /** One summarizer call never reads more than this, so small-context models never overflow. */
  readonly chunkChars: number
}

export const COMPACTION_LIMITS: CompactionLimits = {
  keepRecentChars: 24_000,
  foldMinChars: 16_000,
  chunkChars: 40_000
}

/** Notes past this are clipped, so they can never grow back into the transcript they replace. */
export const SUMMARY_MAX_CHARS = 12_000

/** Shorter than this is a refusal or an error line, not notes; advancing past it would lose messages. */
const SUMMARY_MIN_CHARS = 40

export const NOTES_LABEL =
  '[Meeting notes, condensed from the earlier discussion; not a new request. Messages after them follow word for word]:'

function labelled(message: MeetingMessage): string {
  return message.memberName
    ? `[${message.memberName} - ${message.memberRole}]: ${message.content}`
    : message.content
}

/**
 * What a member reads before its turn: the saved notes first, then every message they do not
 * cover, word for word. Without notes this is the whole transcript, as before.
 */
export function buildContextMessages(
  history: readonly MeetingMessage[],
  summary: CompanySummary | null
): ChatMessage[] {
  const coveredUntilId = summary?.coveredUntilId ?? 0
  const recent = history
    .filter((message) => message.id > coveredUntilId)
    .map((message): ChatMessage => ({
      role: message.senderType === 'user' ? 'user' : 'assistant',
      content: labelled(message)
    }))
  return summary
    ? [{ role: 'user', content: `${NOTES_LABEL}\n${summary.content}` }, ...recent]
    : recent
}

/**
 * The older messages to fold into the notes, in chunks, oldest first; empty when nothing is due.
 * The newest message is never folded, however big, and no message is ever split.
 */
export function planCompaction<T extends MeetingMessage>(
  history: readonly T[],
  coveredUntilId: number,
  limits: CompactionLimits = COMPACTION_LIMITS
): T[][] {
  const uncovered = history.filter((message) => message.id > coveredUntilId)

  let tailStart = uncovered.length - 1
  let tailChars = uncovered[tailStart]?.content.length ?? 0
  while (
    tailStart > 0 &&
    tailChars + uncovered[tailStart - 1].content.length <= limits.keepRecentChars
  ) {
    tailStart--
    tailChars += uncovered[tailStart].content.length
  }

  const foldable = uncovered.slice(0, Math.max(tailStart, 0))
  const foldableChars = foldable.reduce((sum, message) => sum + message.content.length, 0)
  if (foldableChars < limits.foldMinChars) return []

  return foldable.reduce<{ chunks: T[][]; chars: number }>(
    ({ chunks, chars }, message) => {
      const size = message.content.length
      const last = chunks.at(-1)
      return last && chars + size <= limits.chunkChars
        ? { chunks: [...chunks.slice(0, -1), [...last, message]], chars: chars + size }
        : { chunks: [...chunks, [message]], chars: size }
    },
    { chunks: [], chars: 0 }
  ).chunks
}

function clipMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const half = Math.floor(maxChars / 2)
  return `${text.slice(0, half)}\n…[${text.length - 2 * half} characters omitted]…\n${text.slice(-half)}`
}

/** Asks for the earlier notes and the next stretch of transcript merged into one set of notes. */
export function summaryPrompt(
  previous: string | null,
  chunk: readonly MeetingMessage[],
  maxMessageChars: number = COMPACTION_LIMITS.chunkChars
): string {
  const transcript = chunk
    .map((message) => {
      const speaker = message.memberName
        ? `${message.memberName} - ${message.memberRole}`
        : message.senderType === 'user'
          ? 'User'
          : 'Member'
      return `[${speaker}]: ${clipMiddle(message.content, maxMessageChars)}`
    })
    .join('\n\n')

  return [
    'You keep the running notes of a team meeting. Merge the earlier notes and the new transcript below into one updated set of notes.',
    'Keep: every user request and what was done about it, decisions and their reasons, file paths, commands, names, numbers and other exact facts, work finished, and open tasks with who owns them.',
    'Drop: greetings, repetition, and arguments that were settled.',
    'Write plain, dense notes under 1,500 words. Reply with the notes only.',
    '',
    '## Earlier notes',
    previous ?? '(none yet)',
    '',
    '## New transcript',
    transcript
  ].join('\n')
}

/** The summarizer's reply as notes worth saving, or null when it is too short to trust. */
export function usableSummary(text: string): string | null {
  const notes = text.trim()
  if (notes.length < SUMMARY_MIN_CHARS) return null
  return notes.length <= SUMMARY_MAX_CHARS
    ? notes
    : `${notes.slice(0, SUMMARY_MAX_CHARS)}\n…[notes clipped]`
}
