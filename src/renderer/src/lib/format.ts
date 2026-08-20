/** Presentation helpers — pure, no React. */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** SQLite `datetime('now')` returns UTC without a zone marker; make that explicit. */
export function parseSqliteDate(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
}

export function relativeTime(value: string): string {
  const elapsed = Date.now() - parseSqliteDate(value).getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`

  return parseSqliteDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(ms: number | null): string | null {
  if (ms === null) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function formatCost(usd: number | null): string | null {
  if (usd === null) return null
  return usd < 0.01 ? `<$0.01` : `$${usd.toFixed(2)}`
}

/** Collapses a home-anchored path for display: /Users/me/code → ~/code */
export function shortenPath(path: string): string {
  const match = /^\/Users\/[^/]+(\/.*)?$/.exec(path)
  return match ? `~${match[1] ?? ''}` : path
}

/** Last path segment, for labelling an attachment chip. */
export function fileName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}
