/** Every cap on a searched turn, in one place. */
export const SEARCH_LIMITS = {
  /** Hits kept from one query. */
  hitsPerQuery: 8,
  /** Pages read for a Search turn, and for each DeepSearch round. */
  pagesPerRound: 4,
  deepRounds: 3,
  /** Text kept from one page. */
  pageChars: 6_000,
  /** All sources together, as sent to the model. */
  searchContextChars: 16_000,
  deepContextChars: 36_000,
  /** One page load in the hidden browser. */
  pageLoadMs: 15_000,
  /** One call to the search backend. */
  backendMs: 15_000,
  /** What a page may hand back before it is cleaned. */
  rawTextChars: 200_000,
  rawLinks: 400,
  linkTextChars: 200,
  titleChars: 300,
  /** Transcript the query step sees: recent turns, each clipped. */
  queryContextMessages: 6,
  queryContextChars: 2_000
} as const
