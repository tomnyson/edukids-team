import type { SearchFn, SearchHit } from './backend'
import type { Source } from './context'
import { cleanText, type PageSnapshot } from './extract'

export interface GatherOptions {
  readonly queries: readonly string[]
  readonly search: SearchFn
  readonly read: (url: string, signal: AbortSignal) => Promise<PageSnapshot>
  /** Pages read in this round. */
  readonly maxPages: number
  readonly pageBudget: number
  /** The number the first new source gets; later rounds continue the count. */
  readonly firstIndex: number
  /** Pages earlier rounds already read. */
  readonly seen: ReadonlySet<string>
  readonly signal: AbortSignal
  readonly onStatus: (status: string) => void
}

/** Takes hits in turn from each query's list, so one query cannot use every slot. */
function pickHits(
  lists: readonly (readonly SearchHit[])[],
  seen: ReadonlySet<string>,
  limit: number
): readonly SearchHit[] {
  const taken = new Set(seen)
  const picked: SearchHit[] = []
  const cursors = lists.map(() => 0)
  let exhausted = false

  while (picked.length < limit && !exhausted) {
    exhausted = true
    for (const [at, list] of lists.entries()) {
      while (cursors[at] < list.length && taken.has(list[cursors[at]].url)) cursors[at] += 1
      const hit = list[cursors[at]]
      if (!hit || picked.length >= limit) continue
      taken.add(hit.url)
      picked.push(hit)
      exhausted = false
    }
  }
  return picked
}

type Unnumbered = Omit<Source, 'index'>

async function readHit(hit: SearchHit, options: GatherOptions): Promise<Unnumbered | null> {
  const fromHit: Unnumbered | null = hit.snippet
    ? { title: hit.title, url: hit.url, text: hit.snippet }
    : null
  try {
    const page = await options.read(hit.url, options.signal)
    const text = cleanText(page.text, options.pageBudget)
    return text ? { title: page.title || hit.title, url: hit.url, text } : fromHit
  } catch (error) {
    if (options.signal.aborted) throw error
    // A page that will not load still counts for what the search engine said about it
    return fromHit
  }
}

/**
 * One round of search: runs each query, reads the best pages, and returns them numbered. A
 * failed query is skipped; when every query failed, the first failure is thrown.
 */
export async function gatherSources(options: GatherOptions): Promise<readonly Source[]> {
  const { queries, search, signal, onStatus } = options
  const lists: (readonly SearchHit[])[] = []
  const failures: unknown[] = []

  for (const query of queries) {
    signal.throwIfAborted()
    onStatus(`Searching: ${query}`)
    try {
      lists.push(await search(query, signal))
    } catch (error) {
      if (signal.aborted) throw error
      failures.push(error)
    }
  }
  if (lists.length === 0 && failures.length > 0) throw failures[0]

  const hits = pickHits(lists, options.seen, options.maxPages)
  if (hits.length > 0) onStatus(`Reading ${hits.length} ${hits.length === 1 ? 'page' : 'pages'}…`)

  const read: Unnumbered[] = []
  for (const hit of hits) {
    signal.throwIfAborted()
    const source = await readHit(hit, options)
    if (source) read.push(source)
  }
  return read.map((source, at) => ({ ...source, index: options.firstIndex + at }))
}
