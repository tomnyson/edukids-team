import { GraduationCap, MessagesSquare } from 'lucide-react'
import type { ViewMode } from '@renderer/lib/office/prefs'

interface ViewToggleProps {
  readonly view: ViewMode
  readonly onChange: (view: ViewMode) => void
}

const OPTIONS = [
  { id: 'chat', label: 'Chat', Icon: MessagesSquare },
  { id: 'office', label: 'Classroom', Icon: GraduationCap }
] as const

/** Switches a team chat between its transcript and the 3D classroom. */
export function ViewToggle({ view, onChange }: ViewToggleProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="View"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="flex shrink-0 rounded-[var(--radius-pill)] border border-line bg-surface/70 p-0.5"
    >
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] ${
            view === id ? 'bg-canvas text-ink' : 'text-faint hover:text-ink'
          }`}
        >
          <Icon aria-hidden className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}
