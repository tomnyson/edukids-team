import { AlertTriangle, RotateCw, X } from 'lucide-react'
import type { AppError } from '@shared/types'

interface ErrorNoticeProps {
  readonly error: AppError
  readonly onDismiss: () => void
  readonly onRetry?: () => void
}

/** Errors are surfaced in the transcript, never swallowed or reduced to a toast. */
export function ErrorNotice({ error, onDismiss, onRetry }: ErrorNoticeProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-danger-dim bg-[color-mix(in_oklch,var(--c-danger)_9%,var(--c-canvas))] px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />

        <div className="flex-1 space-y-1.5">
          <p className="text-[length:var(--text-ui)] font-medium text-ink">{error.message}</p>
          {error.detail ? (
            <pre className="selectable max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[length:var(--text-micro)] leading-relaxed text-muted">
              {error.detail}
            </pre>
          ) : null}
          <p className="font-mono text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-faint">
            {error.code}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              title="Retry"
              className="rounded-[var(--radius-sm)] p-1.5 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink"
            >
              <RotateCw aria-hidden className="size-3.5" />
              <span className="sr-only">Retry</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss"
            className="rounded-[var(--radius-sm)] p-1.5 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      </div>
    </div>
  )
}
