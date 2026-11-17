import { ListOrdered, Pause, Play, X } from 'lucide-react'
import type { QueuedPrompt } from '@shared/queue'
import type { AppError } from '@shared/types'
import { describeQueued } from '@renderer/lib/queueView'

interface QueuedPromptsProps {
  readonly waiting: readonly QueuedPrompt[]
  readonly paused: boolean
  /** A queue action the main process refused. */
  readonly error: AppError | null
  readonly onRemove: (itemId: string) => void
  readonly onResume: () => void
  readonly onClear: () => void
  readonly onDismissError: () => void
}

const PREVIEW_LENGTH = 48

const preview = (prompt: string): string => {
  const flat = prompt.replace(/\s+/g, ' ')
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat
}

/**
 * The prompts waiting behind the running one, docked on the composer they came from. A paused
 * queue says so loudly: nothing behind a stopped or failed run moves until the user decides.
 */
export function QueuedPrompts({
  waiting,
  paused,
  error,
  onRemove,
  onResume,
  onClear,
  onDismissError
}: QueuedPromptsProps): React.JSX.Element | null {
  if (waiting.length === 0 && !error) return null

  return (
    <section aria-label="Queued prompts" className="shrink-0 px-6 pt-2">
      <div className="mx-auto w-full max-w-[var(--measure)] space-y-1.5">
        {waiting.length > 0 ? (
          <div
            className={`overflow-hidden rounded-[var(--radius-xl)] border bg-[color-mix(in_oklch,var(--c-surface)_72%,var(--c-canvas))] transition-colors duration-[var(--duration-normal)] ${
              paused
                ? 'border-[color-mix(in_oklch,var(--c-warn)_45%,var(--c-line))]'
                : 'border-line'
            }`}
          >
            {paused ? (
              <PausedBand onResume={onResume} onClear={onClear} />
            ) : (
              <UpNextHeader count={waiting.length} onClear={onClear} />
            )}
            <ol className="max-h-44 overflow-y-auto pb-1">
              {waiting.map((prompt, index) => (
                <QueuedRow
                  key={prompt.id}
                  position={index + 1}
                  prompt={prompt}
                  dimmed={paused}
                  onRemove={() => onRemove(prompt.id)}
                />
              ))}
            </ol>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex items-center justify-between gap-3 px-3 text-[length:var(--text-micro)] text-danger"
          >
            <span>{error.message}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted transition-colors duration-[var(--duration-fast)] hover:text-ink"
            >
              <X aria-hidden className="size-3" />
              <span className="sr-only">Dismiss</span>
            </button>
          </p>
        ) : null}
      </div>
    </section>
  )
}

interface UpNextHeaderProps {
  readonly count: number
  readonly onClear: () => void
}

function UpNextHeader({ count, onClear }: UpNextHeaderProps): React.JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3 px-3 pt-2 pb-1">
      <h3 className="flex items-center gap-1.5 text-[length:var(--text-micro)] font-medium uppercase tracking-[0.08em] text-faint">
        <ListOrdered aria-hidden className="size-3.5" />
        Up next
        <span className="rounded-[var(--radius-pill)] bg-raised px-1.5 font-mono tracking-normal text-muted tabular-nums">
          {count}
        </span>
      </h3>
      <button
        type="button"
        onClick={onClear}
        className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-micro)] text-faint transition-colors duration-[var(--duration-fast)] hover:text-danger"
      >
        Clear all
      </button>
    </header>
  )
}

interface PausedBandProps {
  readonly onResume: () => void
  readonly onClear: () => void
}

function PausedBand({ onResume, onClear }: PausedBandProps): React.JSX.Element {
  return (
    <header
      role="status"
      className="flex items-center gap-3 border-b border-[color-mix(in_oklch,var(--c-warn)_25%,var(--c-line))] bg-[color-mix(in_oklch,var(--c-warn)_10%,transparent)] px-3 py-2"
    >
      <Pause aria-hidden className="size-3.5 shrink-0 fill-current text-warn" />
      <p className="min-w-0 flex-1 text-[length:var(--text-meta)] leading-snug text-muted">
        <span className="font-medium text-ink">Queue paused.</span> The last run stopped or failed,
        so nothing below runs until you resume.
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onClear}
          className="h-7 rounded-[var(--radius-pill)] px-3 text-[length:var(--text-meta)] text-muted transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-danger"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onResume}
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] bg-accent px-3 text-[length:var(--text-meta)] font-medium text-canvas transition-all duration-[var(--duration-fast)] hover:bg-accent-bright active:scale-95"
        >
          <Play aria-hidden className="size-3 fill-current" />
          Resume
        </button>
      </div>
    </header>
  )
}

interface QueuedRowProps {
  readonly position: number
  readonly prompt: QueuedPrompt
  readonly dimmed: boolean
  readonly onRemove: () => void
}

function QueuedRow({ position, prompt, dimmed, onRemove }: QueuedRowProps): React.JSX.Element {
  const labels = describeQueued(prompt)

  return (
    <li className="group flex animate-[queue-in_var(--duration-normal)_var(--ease-out-expo)] items-center gap-3 px-3 py-1.5 transition-colors duration-[var(--duration-fast)] focus-within:bg-raised hover:bg-raised">
      <span className="w-4 shrink-0 text-right font-mono text-[length:var(--text-micro)] text-faint tabular-nums">
        {position}
      </span>
      <p
        title={prompt.prompt}
        className={`min-w-0 flex-1 truncate text-[length:var(--text-ui)] ${dimmed ? 'text-muted' : 'text-ink'}`}
      >
        {prompt.prompt}
      </p>
      {labels.map((label) => (
        <span
          key={label}
          className="shrink-0 rounded-[var(--radius-pill)] border border-line px-2 py-px text-[length:var(--text-micro)] text-muted"
        >
          {label}
        </span>
      ))}
      <button
        type="button"
        onClick={onRemove}
        title="Remove from queue"
        className="shrink-0 rounded-full p-1 text-faint opacity-60 transition-[opacity,color,background-color] duration-[var(--duration-fast)] group-hover:opacity-100 hover:bg-[color-mix(in_oklch,var(--c-danger)_12%,transparent)] hover:text-danger focus-visible:opacity-100"
      >
        <X aria-hidden className="size-3.5" />
        <span className="sr-only">Remove “{preview(prompt.prompt)}” from the queue</span>
      </button>
    </li>
  )
}
