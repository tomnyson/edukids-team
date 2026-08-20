import { Paperclip, X } from 'lucide-react'
import { fileName } from '@renderer/lib/format'

interface AttachmentChipsProps {
  readonly paths: readonly string[]
  readonly onRemove: (path: string) => void
}

/** Staged files, shown above the input the way the desktop app stages them. */
export function AttachmentChips({ paths, onRemove }: AttachmentChipsProps): React.JSX.Element {
  return (
    <ul className="flex flex-wrap gap-1.5 border-b border-line px-3 pt-3 pb-2.5">
      {paths.map((path) => (
        <li key={path}>
          <span
            title={path}
            className="group/chip flex max-w-64 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-raised py-1 pr-1 pl-2 font-mono text-[length:var(--text-micro)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong"
          >
            <Paperclip aria-hidden className="size-3 shrink-0 text-accent-dim" />
            <span className="truncate">{fileName(path)}</span>
            <button
              type="button"
              onClick={() => onRemove(path)}
              title={`Remove ${fileName(path)}`}
              className="flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-line hover:text-danger"
            >
              <X aria-hidden className="size-3" />
              <span className="sr-only">Remove {fileName(path)}</span>
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
