import type { SearchFn } from '../backend'
import type { PageReader } from '../browser'
import { looksLikeChallenge, parseSerpLinks, type SerpEngine } from './serp-parse'

interface Engine extends SerpEngine {
  readonly name: string
  readonly searchUrl: (query: string) => string
}

/**
 * The engine whose results page is read. Its plain-HTML page wraps each result link in a
 * redirect that carries the real address in `uddg`. This is a web page, not an API: when it
 * changes, the search returns nothing and the turn says so.
 */
export const SERP_ENGINE: Engine = {
  name: 'DuckDuckGo',
  host: 'duckduckgo.com',
  redirectParam: 'uddg',
  searchUrl: (query) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
}

/** Search by loading the engine's results page in the hidden browser. */
export function browserSearch(reader: PageReader, engine: Engine = SERP_ENGINE): SearchFn {
  return async (query, signal) => {
    const page = await reader.load(engine.searchUrl(query), signal)
    const hits = parseSerpLinks(page.links, engine)
    if (hits.length === 0 && looksLikeChallenge(page.text)) {
      // Stop here. The app does not retry or work around a bot check.
      throw new Error(
        `${engine.name} asked for a human check, so the search was stopped. Try again later, or use a SearXNG instance.`
      )
    }
    return hits
  }
}
