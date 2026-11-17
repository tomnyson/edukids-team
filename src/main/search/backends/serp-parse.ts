import type { SearchHit } from '../backend'
import type { PageLink } from '../extract'
import { SEARCH_LIMITS } from '../limits'
import { checkUrl } from '../url-guard'

/** What tells a result link from the engine's own links on its results page. */
export interface SerpEngine {
  /** The engine's own domain; links that stay on it are not results. */
  readonly host: string
  /** The query parameter that carries the real address when the engine wraps result links. */
  readonly redirectParam: string | null
}

const onHost = (hostname: string, host: string): boolean =>
  hostname === host || hostname.endsWith(`.${host}`)

/** The page a link really leads to, or null when it is one of the engine's own. */
function target(link: PageLink, engine: SerpEngine): string | null {
  let url: URL
  try {
    url = new URL(link.href)
  } catch {
    return null
  }
  if (!onHost(url.hostname, engine.host)) return link.href
  return engine.redirectParam ? url.searchParams.get(engine.redirectParam) : null
}

/**
 * Result links out of everything a results page links to. No selectors: any link that leaves the
 * engine for a public page, and has a title, is a result. Markup changes do not break it; a
 * change to how the engine wraps its links does, and then this returns nothing.
 */
export function parseSerpLinks(
  links: readonly PageLink[],
  engine: SerpEngine
): readonly SearchHit[] {
  const hits = links.flatMap((link): SearchHit[] => {
    const address = target(link, engine)
    const checked = address ? checkUrl(address) : null
    if (!checked?.ok || onHost(checked.url.hostname, engine.host) || !link.text) return []
    return [{ title: link.text, url: checked.url.href, snippet: '' }]
  })
  return hits
    .filter((hit, at) => hits.findIndex((other) => other.url === hit.url) === at)
    .slice(0, SEARCH_LIMITS.hitsPerQuery)
}

const CHALLENGE =
  /captcha|unusual traffic|verify (?:that )?you are (?:a )?human|are you a robot|anomaly/i

/** A results page with no results that reads like a bot check. The app stops; it does not retry. */
export function looksLikeChallenge(pageText: string): boolean {
  return CHALLENGE.test(pageText)
}
