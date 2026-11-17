/** One search result, before its page is read. */
export interface SearchHit {
  readonly title: string
  readonly url: string
  readonly snippet: string
}

/** Where results come from. Throws with a message fit to show the user. */
export type SearchFn = (query: string, signal: AbortSignal) => Promise<readonly SearchHit[]>
