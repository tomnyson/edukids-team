import type { Citation } from '@shared/citations'

interface SourceListProps {
  readonly citations: readonly Citation[]
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The pages a searched reply was written from, numbered as the reply cites them. */
export function SourceList({ citations }: SourceListProps): React.JSX.Element | null {
  if (citations.length === 0) return null

  return (
    <details className="group rounded-[var(--radius-md)] border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-1.5 text-[length:var(--text-micro)] text-muted select-none hover:text-ink">
        {citations.length} {citations.length === 1 ? 'source' : 'sources'}
      </summary>
      <ol className="space-y-1 border-t border-line px-3 py-2">
        {citations.map((citation) => (
          <li key={citation.index} className="flex gap-2 text-[length:var(--text-micro)]">
            <span className="shrink-0 font-mono text-faint tabular-nums">[{citation.index}]</span>
            {/* Opened by the main process in the system browser, never inside the app */}
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              title={citation.url}
              className="min-w-0 truncate text-accent-bright underline decoration-accent-dim underline-offset-2 hover:decoration-accent-bright"
            >
              {citation.title}
            </a>
            <span className="shrink-0 text-faint">{hostOf(citation.url)}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}
