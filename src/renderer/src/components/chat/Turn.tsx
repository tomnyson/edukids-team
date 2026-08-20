import { AlertTriangle } from 'lucide-react'
import type { Message } from '@shared/types'
import { formatCost, formatDuration, relativeTime } from '@renderer/lib/format'
import { Markdown } from './Markdown'
import { Spinner } from '@renderer/components/ui/Spinner'

interface PromptBlockProps {
  readonly prompt: string
}

/**
 * The prompt reads as an editorial standfirst: monospace, offset by an accent
 * rule, deliberately unlike the prose answer that follows it.
 */
function PromptBlock({ prompt }: PromptBlockProps): React.JSX.Element {
  return (
    <div className="border-l-2 border-accent pl-4">
      <p className="selectable whitespace-pre-wrap font-mono text-[length:var(--text-meta)] leading-[1.65] text-ink">
        {prompt}
      </p>
    </div>
  )
}

interface MetaRowProps {
  readonly children: React.ReactNode
}

function MetaRow({ children }: MetaRowProps): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[length:var(--text-micro)] tracking-wide text-faint">
      {children}
    </div>
  )
}

interface TurnProps {
  readonly message: Message
}

export function Turn({ message }: TurnProps): React.JSX.Element {
  const duration = formatDuration(message.durationMs)
  const cost = formatCost(message.costUsd)

  return (
    <article className="space-y-4">
      <PromptBlock prompt={message.prompt} />

      <div data-response className="text-[length:var(--text-body)] text-ink">
        {message.response ? (
          <Markdown>{message.response}</Markdown>
        ) : (
          <p className="text-faint italic">No output.</p>
        )}

        {message.error ? (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-danger-dim bg-[color-mix(in_oklch,var(--c-danger)_8%,transparent)] px-3 py-2">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
            <pre className="selectable whitespace-pre-wrap break-words font-mono text-[length:var(--text-micro)] leading-relaxed text-muted">
              {message.error}
            </pre>
          </div>
        ) : null}

        <MetaRow>
          <span>{relativeTime(message.createdAt)}</span>
          {message.model ? <span className="text-accent-dim">· {message.model}</span> : null}
          {message.effort ? <span>· {message.effort}</span> : null}
          {duration ? <span>· {duration}</span> : null}
          {cost ? <span>· {cost}</span> : null}
        </MetaRow>
      </div>
    </article>
  )
}

interface PendingTurnViewProps {
  readonly prompt: string
  readonly streamed: string
  readonly activeTool: string | null
}

export function PendingTurnView({
  prompt,
  streamed,
  activeTool
}: PendingTurnViewProps): React.JSX.Element {
  return (
    <article className="space-y-4">
      <PromptBlock prompt={prompt} />

      <div className="text-[length:var(--text-body)] text-ink">
        {streamed ? <Markdown highlight={false}>{streamed}</Markdown> : null}
        <MetaRow>
          <Spinner label={activeTool ? `running ${activeTool}` : 'thinking'} />
        </MetaRow>
      </div>
    </article>
  )
}
