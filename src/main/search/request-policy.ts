import { checkUrl } from './url-guard'

export interface BrowserRequest {
  readonly url: string
  /** Electron's name for what is being fetched: `mainFrame`, `script`, `image`, … */
  readonly resourceType: string
}

export type RequestDecision = 'allow' | 'cancel'

/** Not needed to read a page's text, and most of what a page asks for. */
const SKIPPED_TYPES: ReadonlySet<string> = new Set([
  'image',
  'media',
  'font',
  'object',
  'webSocket',
  'ping',
  'cspReport'
])

/** The origin of a URL, or null when it is not one. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Whether a URL is on one of the origins a test has exempted from the public-address rule. */
export const isExempt = (url: string, exemptOrigins: readonly string[]): boolean =>
  exemptOrigins.includes(originOf(url) ?? '')

/**
 * One request made by a page in the hidden browser: let it through, or cancel it.
 * `exemptOrigins` is a test seam for a fixture server on loopback; production passes none.
 */
export function decideRequest(
  request: BrowserRequest,
  exemptOrigins: readonly string[] = []
): RequestDecision {
  if (SKIPPED_TYPES.has(request.resourceType)) return 'cancel'
  if (isExempt(request.url, exemptOrigins)) return 'allow'
  return checkUrl(request.url).ok ? 'allow' : 'cancel'
}
