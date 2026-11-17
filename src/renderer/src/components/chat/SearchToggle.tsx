import { Globe, Telescope } from 'lucide-react'
import { SEARCH_MODES, type SearchMode } from '@shared/search'

interface SearchToggleProps {
  readonly mode: SearchMode
  readonly disabled: boolean
  /** Why search cannot be switched on, shown in place of the hint; null when it can. */
  readonly unavailable: string | null
  readonly onChange: (mode: SearchMode) => void
}

/** Off, then Search, then DeepSearch, then off again. */
function nextMode(mode: SearchMode): SearchMode {
  const at = SEARCH_MODES.findIndex((entry) => entry.id === mode)
  return SEARCH_MODES[(at + 1) % SEARCH_MODES.length].id
}

/**
 * Whether the next prompt is answered from the web. One button that steps through the three
 * modes: the composer has no room for three, and the label always says which one is on.
 */
export function SearchToggle({
  mode,
  disabled,
  unavailable,
  onChange
}: SearchToggleProps): React.JSX.Element {
  const current = SEARCH_MODES.find((entry) => entry.id === mode) ?? SEARCH_MODES[0]
  const on = mode !== 'off'
  const Icon = mode === 'deep' ? Telescope : Globe

  return (
    <button
      type="button"
      disabled={disabled || unavailable !== null}
      aria-label={`Web search: ${current.label}`}
      title={unavailable ?? `${current.hint}. Click to change.`}
      onClick={() => onChange(nextMode(mode))}
      className={`flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:border-transparent disabled:text-faint ${
        on
          ? 'border-accent-dim text-accent hover:border-accent'
          : 'border-transparent text-muted hover:border-line hover:bg-raised hover:text-ink'
      }`}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {on ? <span>{current.label}</span> : null}
    </button>
  )
}
