/** How a direct chat's prompt uses the web. It travels with the prompt, so it is checked on arrival. */
export const SEARCH_MODES = [
  { id: 'off', label: 'Off', hint: 'Answer from the model alone' },
  { id: 'search', label: 'Search', hint: 'Look it up, answer with sources' },
  { id: 'deep', label: 'DeepSearch', hint: 'Several rounds, then a report' }
] as const

export type SearchMode = (typeof SEARCH_MODES)[number]['id']

export const isSearchMode = (value: unknown): value is SearchMode =>
  SEARCH_MODES.some((mode) => mode.id === value)

/** Where search results come from. Neither needs a key. */
export const SEARCH_BACKENDS = [
  { id: 'searxng', label: 'SearXNG', hint: 'Your own instance, through its JSON API' },
  { id: 'browser', label: 'Results page', hint: 'Reads a search engine page in a hidden browser' }
] as const

export type SearchBackendId = (typeof SEARCH_BACKENDS)[number]['id']

export interface SearchSettings {
  readonly backend: SearchBackendId
  /** Empty until the user points the app at an instance. */
  readonly searxngUrl: string
}

/** A hand-typed address, kept only when it is a web URL. */
export function normaliseInstanceUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  try {
    const { protocol } = new URL(trimmed)
    return protocol === 'http:' || protocol === 'https:' ? trimmed : ''
  } catch {
    return ''
  }
}
