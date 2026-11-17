import type { ChatMessage } from '../providers/types'
import { SEARCH_LIMITS } from './limits'

export const MAX_QUERIES = 3
export const MAX_QUERY_LENGTH = 200

const NONE = 'none'

export const QUERY_SYSTEM_PROMPT = [
  'You turn a conversation into web search queries. You do not answer the user.',
  `Reply with at most ${MAX_QUERIES} search queries, one per line, and nothing else:`,
  'no numbering, no quotes, no explanation.',
  'Write each query the way a person types into a search engine, in the language most likely',
  'to find good results.',
  `If nothing needs looking up, reply with the single word ${NONE}.`
].join(' ')

/** A page already read, shown when asking what is still missing. */
export interface FoundPage {
  readonly title: string
  readonly url: string
}

const clip = (message: ChatMessage): ChatMessage => ({
  role: message.role,
  content: message.content.slice(0, SEARCH_LIMITS.queryContextChars)
})

/**
 * What the query step reads: the recent turns for context, then the instruction with the user's
 * newest prompt. With `found`, it asks what those pages still leave unanswered.
 */
export function buildQueryMessages(
  transcript: readonly ChatMessage[],
  today: string,
  found: readonly FoundPage[] = []
): ChatMessage[] {
  const question = transcript.at(-1)?.content ?? ''
  const earlier = transcript.slice(-SEARCH_LIMITS.queryContextMessages, -1).map(clip)
  // A provider expects the first message to be the user's
  const context = earlier.slice(earlier.findIndex((message) => message.role === 'user'))
  const already =
    found.length > 0
      ? [
          '',
          'These pages were already read:',
          ...found.map((page) => `- ${page.title} (${page.url})`),
          `Reply with queries only for what they still leave unanswered, or ${NONE} if they are enough.`
        ]
      : []

  const instruction = [
    `Today is ${today}.`,
    'Write the search queries needed to answer this message:',
    '',
    question.slice(0, SEARCH_LIMITS.queryContextChars),
    ...already
  ].join('\n')

  return [
    ...(earlier.some((message) => message.role === 'user') ? context : []),
    { role: 'user', content: instruction }
  ]
}

const undecorated = (line: string): string =>
  line
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/^["'`“”]+|["'`“”]+$/g, '')
    .trim()

/**
 * The model's reply as queries. `null` means it said no search is needed; an empty list means
 * the reply had nothing usable, and the caller falls back to the user's own words.
 */
export function parseQueries(reply: unknown): readonly string[] | null {
  if (typeof reply !== 'string') return []
  const lines = reply.split('\n').map(undecorated).filter(Boolean)
  if (lines.length === 1 && lines[0].replace(/\.$/, '').toLowerCase() === NONE) return null

  const usable = lines.filter((line) => line.length <= MAX_QUERY_LENGTH)
  const distinct = usable.filter(
    (line, at) => usable.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === at
  )
  return distinct.slice(0, MAX_QUERIES)
}

/** The user's own first line, for when the model produced no usable query. */
export function fallbackQuery(prompt: string): string {
  const firstLine =
    prompt
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  return firstLine.slice(0, MAX_QUERY_LENGTH)
}
