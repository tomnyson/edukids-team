import { memo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Element, ElementContent } from 'hast'
import { Check, Copy } from 'lucide-react'
import { rehypeFilePaths } from '@renderer/lib/filePaths'
import { FileLink } from './FileLink'

/** Raw source of a node. Highlighted code is a tree of spans, not a string. */
function nodeText(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(nodeText).join('')
  return ''
}

interface CodeBlockProps {
  readonly language: string | null
  /** Plain source for the clipboard; `children` carries the highlight spans. */
  readonly code: string
  readonly className: string | undefined
  readonly children: React.ReactNode
}

function CodeBlock({ language, code, className, children }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure className="group my-4 overflow-hidden rounded-[var(--radius-md)] border border-line bg-void">
      <figcaption className="flex items-center justify-between border-b border-line bg-[var(--c-rail)] px-3 py-1.5">
        <span className="font-mono text-[length:var(--text-micro)] uppercase tracking-[0.1em] text-faint">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] text-faint opacity-0 transition-all duration-[var(--duration-fast)] hover:bg-raised hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? (
            <Check aria-hidden className="size-3 text-ok" />
          ) : (
            <Copy aria-hidden className="size-3" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="selectable overflow-x-auto px-3 py-3">
        <code
          className={`font-mono text-[length:var(--text-meta)] leading-[1.7] text-ink ${className ?? ''}`}
        >
          {children}
        </code>
      </pre>
    </figure>
  )
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-[length:var(--text-title)] font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2.5 text-[length:var(--text-title)] font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-[length:var(--text-body)] font-semibold">{children}</h3>
  ),
  p: ({ children }) => <p className="my-3 leading-[1.7]">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-faint">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-faint">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.65]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-accent-dim pl-4 text-muted italic">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-bright underline decoration-accent-dim underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:decoration-accent-bright"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-line" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-line">
      <table className="w-full border-collapse text-[length:var(--text-meta)]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line bg-[var(--c-rail)] px-3 py-2 text-left font-medium text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top">{children}</td>,
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, node }) => {
    const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? null
    const code = node ? nodeText(node) : String(children)

    // Fenced blocks arrive with a language class or embedded newlines. Their
    // children stay as-is: flattening them would throw away the highlighting.
    if (language || code.includes('\n')) {
      return (
        <CodeBlock language={language} code={code} className={className}>
          {children}
        </CodeBlock>
      )
    }

    return (
      <code className="rounded-[var(--radius-sm)] border border-line bg-void px-1.5 py-0.5 font-mono text-[0.875em] text-accent-bright">
        {children}
      </code>
    )
  },
  // Only spans the file-path plugin created carry this; everything else passes through.
  span: ({ children, node, ...props }) => {
    const path = node?.properties?.dataFilePath
    if (typeof path !== 'string') return <span {...props}>{children}</span>

    const raw = node?.properties?.dataFileLine
    const line = typeof raw === 'string' ? Number(raw) : null
    return (
      <FileLink path={path} line={line}>
        {children}
      </FileLink>
    )
  }
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeHighlight, rehypeFilePaths]
/** Streaming text is re-parsed on every delta; highlighting it is wasted work. */
const REHYPE_PLAIN = [rehypeFilePaths]

interface MarkdownProps {
  readonly children: string
  readonly highlight?: boolean
}

export const Markdown = memo(function Markdown({
  children,
  highlight = true
}: MarkdownProps): React.JSX.Element {
  return (
    <div className="selectable">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={highlight ? REHYPE_PLUGINS : REHYPE_PLAIN}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
