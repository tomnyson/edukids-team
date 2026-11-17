import { isWebUrl } from '@shared/citations'
import type { SearchHit } from '../backend'
import { SEARCH_LIMITS } from '../limits'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The instance's search address. The instance URL is the user's own setting and is usually on
 * this machine, so it is not held to the public-address rule that pages are; it must still be a
 * web URL.
 */
export function searxngSearchUrl(instanceUrl: string, query: string): string {
  if (!instanceUrl.trim()) throw new Error('Set a SearXNG instance URL in Settings → Search.')
  let base: URL
  try {
    base = new URL(instanceUrl.trim())
  } catch {
    throw new Error('The SearXNG instance URL is not a valid address.')
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('The SearXNG instance URL must start with http:// or https://.')
  }
  const path = `${base.pathname.replace(/\/+$/, '')}/search`
  const params = new URLSearchParams({ q: query, format: 'json' })
  return `${base.origin}${path}?${params.toString()}`
}

function toHit(value: unknown): SearchHit | null {
  if (!isRecord(value) || !isWebUrl(value.url)) return null
  const title =
    typeof value.title === 'string' && value.title.trim() ? value.title.trim() : value.url
  return {
    title: title.slice(0, SEARCH_LIMITS.titleChars),
    url: value.url,
    snippet: typeof value.content === 'string' ? value.content.trim() : ''
  }
}

/** The instance's JSON reply as hits. It is another server's output, so every field is checked. */
export function parseSearxngResults(json: unknown): readonly SearchHit[] {
  if (!isRecord(json) || !Array.isArray(json.results)) return []
  const hits = json.results.map(toHit).filter((hit): hit is SearchHit => hit !== null)
  return hits
    .filter((hit, at) => hits.findIndex((other) => other.url === hit.url) === at)
    .slice(0, SEARCH_LIMITS.hitsPerQuery)
}

export async function searchSearxng(
  instanceUrl: string,
  query: string,
  signal: AbortSignal
): Promise<readonly SearchHit[]> {
  const url = searxngSearchUrl(instanceUrl, query)
  const limited = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_LIMITS.backendMs)])

  let response: Response
  try {
    response = await fetch(url, { signal: limited, headers: { accept: 'application/json' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(`Could not reach the SearXNG instance at ${new URL(url).origin}.`, {
      cause: error
    })
  }
  if (response.status === 403) {
    throw new Error(
      'The SearXNG instance refused JSON output. Add `json` under `search.formats` in its settings.yml.'
    )
  }
  if (!response.ok) throw new Error(`The SearXNG instance answered HTTP ${response.status}.`)

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('The SearXNG instance did not answer with JSON.', { cause: error })
  }
  return parseSearxngResults(json)
}
