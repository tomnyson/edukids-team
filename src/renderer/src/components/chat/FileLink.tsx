import { useEffect, useState } from 'react'

interface FileLinkProps {
  readonly path: string
  readonly line: number | null
  readonly children: React.ReactNode
}

/**
 * A path Claude mentioned, made clickable. The renderer knows nothing about
 * editors or the filesystem — it asks the main process to open the path and
 * shows whatever came back, including the refusal.
 */
export function FileLink({ path, line, children }: FileLinkProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)

  // A failure is worth reading once, not worth living in the transcript.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  const open = async (): Promise<void> => {
    const result = await window.api.openInEditor(path, line)
    setError(result.ok ? null : result.error.message)
  }

  const target = line === null ? path : `${path}:${line}`

  return (
    <>
      <button
        type="button"
        data-file-link
        onClick={open}
        title={`Open ${target}`}
        className="cursor-pointer rounded-[var(--radius-sm)] font-mono text-[0.9em] text-accent-bright underline decoration-accent-dim decoration-dotted underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:decoration-accent-bright"
      >
        {children}
      </button>
      {error ? (
        <span role="status" className="ml-1.5 text-[length:var(--text-micro)] text-danger">
          {error}
        </span>
      ) : null}
    </>
  )
}
