interface SpinnerProps {
  readonly label?: string
}

/** Compositor-only motion: rotation on a transform, nothing layout-bound. */
export function Spinner({ label }: SpinnerProps): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-faint" role="status" aria-live="polite">
      <span
        aria-hidden
        className="size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent"
      />
      {label ? (
        <span className="font-mono text-[length:var(--text-micro)] tracking-wide">{label}</span>
      ) : null}
    </span>
  )
}
