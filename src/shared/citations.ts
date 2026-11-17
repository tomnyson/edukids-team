/** The pages a searched reply was written from, and how `[N]` in the reply points back at them. */

export interface Citation {
  readonly index: number
  readonly title: string
  readonly url: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Only web addresses become links: a stored `javascript:` or `file:` URL must never be one. */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function toCitations(sources: readonly Citation[]): readonly Citation[] {
  return sources.map(({ index, title, url }) => ({ index, title, url }))
}

function toCitation(value: unknown): Citation | null {
  if (!isRecord(value)) return null
  const { index, title, url } = value
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 1) return null
  if (!isWebUrl(url)) return null
  return { index, title: typeof title === 'string' && title.trim() ? title : url, url }
}

/** Reads the stored JSON column. Anything malformed is no citations, never a thrown error. */
export function parseCitations(raw: unknown): readonly Citation[] {
  if (typeof raw !== 'string' || !raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(toCitation).filter((citation): citation is Citation => citation !== null)
}

// Code and links that already exist are matched first so they are passed over untouched
const CITATION_PATTERN = /```[\s\S]*?```|`[^`\n]*`|\[\[\d+\]\]\([^)]*\)|(?<!\w)\[(\d+)\](?!\()/g

/** Turns each `[N]` that names a known source into a markdown link to it. */
export function linkCitations(text: string, citations: readonly Citation[]): string {
  if (citations.length === 0) return text
  const urls = new Map(citations.map((citation) => [citation.index, citation.url]))
  return text.replace(CITATION_PATTERN, (match, digits: string | undefined) => {
    if (digits === undefined) return match
    const url = urls.get(Number(digits))
    return url ? `[[${digits}]](${url})` : match
  })
}
