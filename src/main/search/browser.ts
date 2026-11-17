/**
 * The hidden browser: one window nobody sees, in a session of its own, that loads a page and
 * hands back its text and links. Every page it loads is treated as hostile, so the window gets
 * no preload, no Node, no permissions, no downloads and no way to reach the local network.
 */
import { BrowserWindow, session, type Session } from 'electron'
import { toPageSnapshot, type PageSnapshot } from './extract'
import { SEARCH_LIMITS } from './limits'
import { decideRequest, isExempt } from './request-policy'
import { checkUrl, isPublicAddress } from './url-guard'

/** No `persist:` prefix, so cookies and storage live in memory and die with the app. */
const PARTITION = 'search-reader'
/** Runs apart from the page's own scripts, which therefore cannot tamper with it. */
const ISOLATED_WORLD = 4_217
const SCRIPT_TIMEOUT_MS = 4_000

const EXTRACT_SCRIPT = `(() => ({
  title: String(document.title || '').slice(0, ${SEARCH_LIMITS.titleChars}),
  text: String((document.body && document.body.innerText) || '').slice(0, ${SEARCH_LIMITS.rawTextChars}),
  links: Array.from(document.links).slice(0, ${SEARCH_LIMITS.rawLinks}).map((link) => ({
    href: String(link.href),
    text: String(link.innerText || '').slice(0, ${SEARCH_LIMITS.linkTextChars})
  }))
}))()`

export interface PageReader {
  /** Loads one page and reads it. Rejects when the page is refused, fails or the turn is stopped. */
  readonly load: (url: string, signal: AbortSignal) => Promise<PageSnapshot>
  readonly close: () => void
}

export interface ReaderOptions {
  /** Test seam: origins exempt from the public-address rule, for a fixture server on loopback. */
  readonly allowOrigins?: readonly string[]
  /** Test seam: a shorter wait for a page that never finishes loading. */
  readonly loadTimeoutMs?: number
}

const configured = new WeakSet<Session>()

/** Every address the name resolves to must be public; a name that does not resolve is refused. */
async function resolvesPublic(ses: Session, url: string): Promise<boolean> {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '')
  try {
    const { endpoints } = await ses.resolveHost(hostname)
    return endpoints.length > 0 && endpoints.every((endpoint) => isPublicAddress(endpoint.address))
  } catch {
    return false
  }
}

function readerSession(allowOrigins: readonly string[]): Session {
  const ses = session.fromPartition(PARTITION)

  // Only the last listener counts, so setting it again for a new reader is safe
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (decideRequest(details, allowOrigins) === 'cancel') return callback({ cancel: true })
    if (isExempt(details.url, allowOrigins)) return callback({ cancel: false })
    // The hostname passed; what it resolves to is checked too, or a public name could point inward
    void resolvesPublic(ses, details.url).then((isPublic) => callback({ cancel: !isPublic }))
  })

  if (!configured.has(ses)) {
    configured.add(ses)
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    ses.on('will-download', (event) => event.preventDefault())
  }
  return ses
}

function createWindow(ses: Session): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      images: false
    }
  })
  window.webContents.setAudioMuted(true)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}

const timeout = <T>(ms: number, value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms).unref())

/** Loads the page, then reads it. A slow page is read as far as it got. */
async function loadAndRead(
  window: BrowserWindow,
  url: string,
  signal: AbortSignal,
  loadTimeoutMs: number
): Promise<PageSnapshot> {
  const contents = window.webContents
  const stopped = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  // A cancelled frame or script makes the whole load report failure even though the page itself
  // arrived, so a failure only counts when it is the page's own
  let pageFailed = false
  const onFail = (
    _event: unknown,
    _code: number,
    _description: string,
    _url: string,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame) pageFailed = true
  }
  // Until the new page commits, the window still holds the one before it
  let committed = false
  const onNavigate = (): void => {
    committed = true
  }
  contents.on('did-fail-load', onFail)
  contents.on('did-navigate', onNavigate)
  try {
    await Promise.race([contents.loadURL(url), timeout(loadTimeoutMs, undefined), stopped])
  } catch (error) {
    if (signal.aborted || pageFailed) throw error
  } finally {
    // The app may be quitting, which takes the window with it
    if (!contents.isDestroyed()) {
      contents.off('did-fail-load', onFail)
      contents.off('did-navigate', onNavigate)
    }
  }
  if (contents.isDestroyed()) throw new Error('The search was closed.')
  // Reading now would return the previous page's text under this page's address
  if (!committed) throw new Error('The page took too long to answer.')
  contents.stop()

  const HUNG = Symbol('hung')
  const raw: unknown = await Promise.race([
    contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: EXTRACT_SCRIPT }]),
    timeout(SCRIPT_TIMEOUT_MS, HUNG),
    stopped
  ])
  if (raw === HUNG) throw new Error('The page did not respond.')

  const snapshot = toPageSnapshot(raw)
  if (!snapshot) throw new Error('The page could not be read.')
  return snapshot
}

/** Opens a reader. Nothing is created until the first page is asked for. */
export function createPageReader(options: ReaderOptions = {}): PageReader {
  const allowOrigins = options.allowOrigins ?? []
  const loadTimeoutMs = options.loadTimeoutMs ?? SEARCH_LIMITS.pageLoadMs
  let window: BrowserWindow | null = null
  let closed = false
  // Pages load one at a time: there is one window
  let turn: Promise<unknown> = Promise.resolve()

  const discard = (): void => {
    if (window && !window.isDestroyed()) window.destroy()
    window = null
  }

  const loadOne = async (url: string, signal: AbortSignal): Promise<PageSnapshot> => {
    signal.throwIfAborted()
    if (closed) throw new Error('The search was closed.')
    const checked = checkUrl(url)
    if (!isExempt(url, allowOrigins) && !checked.ok) throw new Error(checked.reason)

    if (!window || window.isDestroyed()) window = createWindow(readerSession(allowOrigins))
    try {
      return await loadAndRead(window, url, signal, loadTimeoutMs)
    } catch (error) {
      // A window left mid-load or hung is not reused
      discard()
      throw error
    }
  }

  return {
    load: (url, signal) => {
      const next = turn.then(
        () => loadOne(url, signal),
        () => loadOne(url, signal)
      )
      turn = next.catch(() => undefined)
      return next
    },
    close: () => {
      closed = true
      discard()
      void session
        .fromPartition(PARTITION)
        .clearStorageData()
        .catch(() => undefined)
    }
  }
}
