import type { Element, ElementContent, Root, RootContent } from 'hast'

/**
 * Turns file paths Claude mentions in prose into markers the renderer can hang
 * a click on. It only marks them — resolving and opening happens in the main
 * process, which re-validates the path from scratch.
 */

/** `/a/b`, `~/a/b`, `./a/b`, each optionally followed by `:line` or `:line:col`. */
const PATH = /(?:~|\.{1,2})?\/(?:[\w.@+-]+\/)*[\w.@+-]+(?::\d+(?::\d+)?)?/g

/** Tags whose text is never prose: already highlighted, or already a link. */
const SKIP = new Set(['pre', 'a', 'script', 'style'])

const TRAILING = /[.,;:!?)\]}'"]+$/

export interface FileRef {
  readonly path: string
  readonly line: number | null
}

/**
 * A match is only a path if it could plausibly name a file: two segments deep,
 * or one segment with an extension. Without this, ordinary prose slashes
 * ("either/or", "1/2") become dead links.
 */
function toRef(raw: string): FileRef | null {
  const value = raw.replace(TRAILING, '')
  const located = /^(.*?):(\d+)(?::\d+)?$/.exec(value)
  const path = located ? located[1] : value
  const line = located ? Number(located[2]) : null

  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return null
  const named = segments.length > 1 || /\.[A-Za-z0-9]+$/.test(segments[0])
  if (!named) return null

  return { path, line: line && line > 0 ? line : null }
}

/**
 * Rejects a `/` that continues a word or a URL — `and/or`, `1/2`,
 * `https://example.com/x` all match the pattern but none of them are paths.
 */
function startsCleanly(text: string, index: number): boolean {
  if (index === 0) return true
  const before = text[index - 1]
  return !/[\w:/~.@+-]/.test(before)
}

function markText(value: string): ElementContent[] | null {
  const out: ElementContent[] = []
  let cursor = 0
  PATH.lastIndex = 0

  for (let match = PATH.exec(value); match; match = PATH.exec(value)) {
    if (!startsCleanly(value, match.index)) continue
    const ref = toRef(match[0])
    if (!ref) continue

    // What we matched may be longer than the path (a trailing full stop).
    const label = match[0].replace(TRAILING, '')
    if (match.index > cursor) out.push({ type: 'text', value: value.slice(cursor, match.index) })
    out.push({
      type: 'element',
      tagName: 'span',
      properties: {
        dataFilePath: ref.path,
        ...(ref.line === null ? {} : { dataFileLine: String(ref.line) })
      },
      children: [{ type: 'text', value: label }]
    })
    cursor = match.index + label.length
  }

  if (out.length === 0) return null
  if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) })
  return out
}

function walk(node: Root | Element): void {
  const children: RootContent[] = []
  let changed = false

  for (const child of node.children) {
    if (child.type === 'text') {
      const marked = markText(child.value)
      if (marked) {
        children.push(...marked)
        changed = true
        continue
      }
    } else if (child.type === 'element' && !SKIP.has(child.tagName)) {
      walk(child)
    }
    children.push(child)
  }

  if (changed) (node as Root).children = children
}

/** Rehype plugin: wraps every file path in `<span data-file-path …>`. */
export function rehypeFilePaths() {
  return (tree: Root): void => walk(tree)
}
