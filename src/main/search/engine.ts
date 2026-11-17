/** The configured search, opened for one turn: a way to search, a way to read a page, and a close. */
import type { SearchBackendId, SearchSettings } from '@shared/search'
import type { SearchFn } from './backend'
import { browserSearch } from './backends/browser-serp'
import { searchSearxng } from './backends/searxng'
import { createPageReader, type PageReader } from './browser'
import { createSearchCache, withCache, type SearchCache } from './cache'

const CACHE_TTL_MS = 5 * 60_000
const CACHE_ENTRIES = 50

// One cache per backend, so switching backends never serves the other's results
const caches: Record<SearchBackendId, SearchCache> = {
  searxng: createSearchCache(),
  browser: createSearchCache()
}

export interface SearchSession {
  readonly search: SearchFn
  readonly read: PageReader['load']
  readonly close: () => void
}

/** Why search cannot run with these settings, or null when it can. */
export function searchSetupProblem(settings: SearchSettings): string | null {
  if (settings.backend === 'searxng' && !settings.searxngUrl) {
    return 'Search is not set up yet. Add a SearXNG instance URL in Settings → Search.'
  }
  return null
}

export function openSearch(settings: SearchSettings): SearchSession {
  const problem = searchSetupProblem(settings)
  if (problem) throw new Error(problem)

  const reader = createPageReader()
  const backend: SearchFn =
    settings.backend === 'browser'
      ? browserSearch(reader)
      : (query, signal) => searchSearxng(settings.searxngUrl, query, signal)

  return {
    search: withCache(backend, caches[settings.backend], {
      ttlMs: CACHE_TTL_MS,
      maxEntries: CACHE_ENTRIES
    }),
    read: reader.load,
    close: reader.close
  }
}
