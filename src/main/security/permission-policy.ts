/**
 * Which web permissions the renderer gets. Electron grants everything when no handler is set,
 * so once the microphone needs one, every other permission has to be listed here or it breaks.
 * Pure, so the policy is tested without Electron.
 */

/** Permissions the app's own page may use without further conditions. */
const ALWAYS_ALLOWED: ReadonlySet<string> = new Set([
  // The copy button on code blocks
  'clipboard-sanitized-write'
])

export interface PermissionAsk {
  readonly permission: string
  /** The URL of the frame asking. */
  readonly url: string
  readonly mainFrame: boolean
  /** For `media`: which devices, `audio` being the microphone. */
  readonly mediaTypes: readonly string[]
}

/**
 * True for a page this app serves. The packaged renderer is a `file:` page, whose origin is the
 * string "null", so the URL is checked rather than the origin. A dev server counts only while the
 * app is running from it.
 */
export function isAppUrl(url: string, devOrigin: string | null): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') return true
  return devOrigin !== null && parsed.origin === devOrigin
}

/** Media is allowed only as the microphone alone: no camera, no unspecified device. */
function isMicrophoneOnly(mediaTypes: readonly string[]): boolean {
  return mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio')
}

export function permissionAllowed(ask: PermissionAsk, devOrigin: string | null): boolean {
  if (!ask.mainFrame || !isAppUrl(ask.url, devOrigin)) return false
  if (ALWAYS_ALLOWED.has(ask.permission)) return true
  return ask.permission === 'media' && isMicrophoneOnly(ask.mediaTypes)
}
