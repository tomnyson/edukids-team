import type { SearchFn, SearchHit } from './backend'

export interface CacheOptions {
  readonly ttlMs: number
  readonly maxEntries: number
  readonly now?: () => number
}

interface Entry {
  readonly at: number
  readonly hits: readonly SearchHit[]
}

/**
 * Remembers recent queries, so asking the same thing twice in a few minutes does not hit the
 * backend twice. Failures and empty results are not remembered.
 */
export function withCache(
  search: SearchFn,
  store: Map<string, Entry>,
  options: CacheOptions
): SearchFn {
  const now = options.now ?? Date.now
  return async (query, signal) => {
    const key = query.trim().toLowerCase()
    const cached = store.get(key)
    if (cached && now() - cached.at < options.ttlMs) return cached.hits

    const hits = await search(query, signal)
    if (hits.length === 0) return hits
    store.delete(key)
    store.set(key, { at: now(), hits })
    // A Map keeps insertion order, so the first key is the oldest
    const oldest = store.keys().next().value
    if (store.size > options.maxEntries && oldest !== undefined) store.delete(oldest)
    return hits
  }
}

export type SearchCache = Map<string, Entry>
export const createSearchCache = (): SearchCache => new Map()
