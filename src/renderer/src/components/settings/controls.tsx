/** The shared vocabulary of the settings panes: one row, one control, one hint. */

interface RowProps {
  readonly label: string
  readonly hint?: string
  readonly children: React.ReactNode
}

export function Row({ label, hint, children }: RowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-6 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--text-ui)] text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-[length:var(--text-micro)] text-faint">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export interface Choice<T extends string> {
  readonly id: T
  readonly label: string
  readonly hint?: string | null
}

interface PickerProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly options: readonly Choice<T>[]
  readonly onChange: (value: T) => void
}

/** A native select: the OS already knows how to render a long list well. */
export function Picker<T extends string>({
  label,
  value,
  options,
  onChange
}: PickerProps<T>): React.JSX.Element {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="min-w-40 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-ui)] text-ink transition-colors duration-[var(--duration-fast)] hover:border-line-strong"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

interface SegmentedProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly options: readonly Choice<T>[]
  readonly onChange: (value: T) => void
}

/** Three or fewer options that the eye should compare at once. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-0.5 rounded-[var(--radius-md)] border border-line bg-canvas p-0.5"
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`rounded-[calc(var(--radius-md)-2px)] px-3 py-1 text-[length:var(--text-ui)] transition-colors duration-[var(--duration-fast)] ${
              selected
                ? 'bg-accent text-[var(--c-canvas)]'
                : 'text-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
