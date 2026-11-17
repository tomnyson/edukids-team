/**
 * Which addresses the app may request on a page's behalf: public web pages only. A page, or a
 * search result, that points at this machine or the local network is refused.
 */

export type UrlCheck =
  { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly reason: string }

const refuse = (reason: string): UrlCheck => ({ ok: false, reason })

/** Names that only ever resolve to this machine or this network. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home.arpa']

function parseIpv4(text: string): readonly number[] | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : -1))
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null
}

function parseGroups(text: string): readonly number[] | null {
  if (text === '') return []
  const groups = text
    .split(':')
    .map((part) => (/^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : -1))
  return groups.every((group) => group >= 0) ? groups : null
}

/** An IPv6 address as its eight 16-bit groups. */
function parseIpv6(text: string): readonly number[] | null {
  // A dotted tail (`::ffff:127.0.0.1`) is two groups written as IPv4
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  const v4 = tail.includes('.') ? parseIpv4(tail) : null
  if (tail.includes('.') && !v4) return null
  const expanded = v4
    ? `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
    : text

  const halves = expanded.split('::')
  if (halves.length > 2) return null
  const head = parseGroups(halves[0])
  const rest = halves.length === 2 ? parseGroups(halves[1]) : []
  if (!head || !rest) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const gap = 8 - head.length - rest.length
  return gap >= 1 ? [...head, ...new Array<number>(gap).fill(0), ...rest] : null
}

function isPublicIpv4([a, b, c]: readonly number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

const embeddedIpv4 = (high: number, low: number): readonly number[] => [
  high >> 8,
  high & 0xff,
  low >> 8,
  low & 0xff
]

function isPublicIpv6(groups: readonly number[]): boolean {
  const [first, second, third] = groups
  const leadingZeros = groups.slice(0, 5).every((group) => group === 0)
  // IPv4 carried inside IPv6 is judged as the IPv4 address it reaches
  if (leadingZeros && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPublicIpv4(embeddedIpv4(groups[6], groups[7]))
  }
  if (first === 0x64 && second === 0xff9b) return isPublicIpv4(embeddedIpv4(groups[6], groups[7]))
  if (first === 0x2002) return isPublicIpv4(embeddedIpv4(second, third))
  if ((first & 0xfe00) === 0xfc00) return false
  if ((first & 0xffc0) === 0xfe80) return false
  if ((first & 0xff00) === 0xff00) return false
  if (first === 0x2001 && second === 0xdb8) return false
  return true
}

/** Whether an IP address, as text, is one on the public internet. Anything unparseable is not. */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address)
  if (v4) return isPublicIpv4(v4)
  const v6 = address.includes(':') ? parseIpv6(address) : null
  return v6 ? isPublicIpv6(v6) : false
}

function isLocalName(hostname: string): boolean {
  return LOCAL_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

/**
 * Checks a URL before it is requested. The URL parser has already folded the odd spellings of an
 * IP address (`2130706433`, `0x7f.1`) into dotted form, so one check covers them. A hostname that
 * passes here can still resolve to a private address; the browser checks that when it resolves.
 */
export function checkUrl(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || !raw) return refuse('Not a URL.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return refuse('Not a URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return refuse('Only web pages are read.')
  if (url.username || url.password) return refuse('URLs with credentials are not read.')

  const hostname = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!hostname) return refuse('Not a URL.')
  if (isLocalName(hostname)) return refuse('Local addresses are not read.')

  const literal = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  const isAddress = hostname.startsWith('[') || parseIpv4(literal) !== null
  if (isAddress && !isPublicAddress(literal)) return refuse('Local addresses are not read.')
  return { ok: true, url }
}
