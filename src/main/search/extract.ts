import { SEARCH_LIMITS } from './limits'

export interface PageLink {
  readonly href: string
  readonly text: string
}

/** What was read from one loaded page. */
export interface PageSnapshot {
  readonly title: string
  readonly text: string
  readonly links: readonly PageLink[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const clipped = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit).trim() : ''

/** Page text with its whitespace collapsed, cut to `budget` characters. */
export function cleanText(raw: unknown, budget: number): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, budget)
}

function toLink(value: unknown): PageLink | null {
  if (!isRecord(value) || typeof value.href !== 'string') return null
  return { href: value.href, text: clipped(value.text, SEARCH_LIMITS.linkTextChars) }
}

/**
 * Rebuilds what a page's script returned, field by field. The page is hostile until proven
 * otherwise, so nothing of its object is kept except strings of bounded length.
 */
export function toPageSnapshot(raw: unknown): PageSnapshot | null {
  if (!isRecord(raw)) return null
  const links = Array.isArray(raw.links) ? raw.links.slice(0, SEARCH_LIMITS.rawLinks) : []
  return {
    title: clipped(raw.title, SEARCH_LIMITS.titleChars),
    text: clipped(raw.text, SEARCH_LIMITS.rawTextChars),
    links: links.map(toLink).filter((link): link is PageLink => link !== null)
  }
}
