import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { EFFORTS, MODELS, type EffortId, type ModelId } from '@shared/types'
import { Popover, type CloseIntent } from '@renderer/components/ui/Popover'

interface RunSettingsProps {
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly disabled: boolean
  readonly onModelChange: (model: ModelId | null) => void
  readonly onEffortChange: (effort: EffortId | null) => void
}

const DEFAULT_LABEL = 'default'

const labelOf = <T extends { id: string; label: string }>(
  options: readonly T[],
  id: string | null
): string => options.find((option) => option.id === id)?.label ?? DEFAULT_LABEL

/** Focus the next `[data-menu="scope"]` item, wrapping at either end. */
function moveFocus(panel: HTMLElement | null, scope: string, delta: number): void {
  if (!panel) return
  const items = [...panel.querySelectorAll<HTMLElement>(`[data-menu="${scope}"]`)]
  if (items.length === 0) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = current === -1 ? 0 : (current + delta + items.length) % items.length
  items[next].focus()
}

/**
 * Model and effort in one pill, because they are one decision: how hard the next
 * turn should think. Both are per-turn, both are remembered from the last turn,
 * and neither changes anything already in the transcript.
 */
export function RunSettings({
  model,
  effort,
  disabled,
  onModelChange,
  onEffortChange
}: RunSettingsProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const effortRowRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(({ restoreFocus }: CloseIntent): void => {
    setOpen(false)
    setEffortOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Opening with the keyboard must land somewhere; the first row is that place.
  useEffect(() => {
    if (open) moveFocus(rootRef.current, 'model', 0)
  }, [open])

  const closeSubmenu = useCallback((): void => {
    setEffortOpen(false)
    effortRowRef.current?.focus()
  }, [])

  const chooseModel = (next: ModelId | null): void => {
    onModelChange(next)
    close({ restoreFocus: true })
  }

  const chooseEffort = (next: EffortId | null): void => {
    onEffortChange(next)
    close({ restoreFocus: true })
  }

  return (
    <div className="relative flex items-center">
      <button
        id="run-settings"
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close({ restoreFocus: false }) : setOpen(true))}
        title="Model and effort for the next turn"
        className="flex cursor-pointer items-center gap-1 rounded-full border border-transparent py-1 pr-1.5 pl-2 font-mono text-[length:var(--text-micro)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-transparent disabled:hover:bg-transparent"
      >
        <span>{labelOf(MODELS, model)}</span>
        {effort ? <span className="text-faint">· {labelOf(EFFORTS, effort)}</span> : null}
        <ChevronDown aria-hidden className="size-3 text-faint" />
      </button>

      <Popover open={open} label="Run settings" anchorRef={triggerRef} onClose={close}>
        <div
          ref={rootRef}
          role="menu"
          aria-label="Model"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            moveFocus(rootRef.current, 'model', event.key === 'ArrowDown' ? 1 : -1)
          }}
        >
          <MenuOption
            scope="model"
            label="Default"
            hint="Whatever the CLI is configured with"
            checked={model === null}
            onSelect={() => chooseModel(null)}
          />
          {MODELS.map((option) => (
            <MenuOption
              key={option.id}
              scope="model"
              label={option.label}
              hint={option.hint}
              checked={model === option.id}
              onSelect={() => chooseModel(option.id)}
            />
          ))}

          <div role="separator" className="my-1 h-px bg-line" />

          <div className="relative">
            <button
              ref={effortRowRef}
              type="button"
              role="menuitem"
              data-menu="model"
              aria-haspopup="menu"
              aria-expanded={effortOpen}
              onClick={() => setEffortOpen((current) => !current)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                setEffortOpen(true)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-ui)] text-ink transition-colors duration-[var(--duration-fast)] hover:bg-raised focus-visible:bg-raised"
            >
              <span className="flex-1">Effort</span>
              <span className="font-mono text-[length:var(--text-micro)] text-faint">
                {labelOf(EFFORTS, effort)}
              </span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" />
            </button>

            {effortOpen ? (
              <div
                role="menu"
                aria-label="Effort"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    event.stopPropagation()
                    moveFocus(rootRef.current, 'effort', event.key === 'ArrowDown' ? 1 : -1)
                    return
                  }
                  // Escape backs out one level; the popover keeps the other one.
                  if (event.key === 'ArrowLeft' || event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    closeSubmenu()
                  }
                }}
                className="absolute right-full bottom-0 z-10 mr-1 w-64 rounded-[var(--radius-lg)] border border-line-strong bg-surface py-1 shadow-[0_18px_44px_-14px_var(--c-shadow)]"
              >
                <MenuOption
                  scope="effort"
                  label="Default"
                  hint="Whatever the CLI is configured with"
                  checked={effort === null}
                  autoFocus={effort === null}
                  onSelect={() => chooseEffort(null)}
                />
                {EFFORTS.map((option) => (
                  <MenuOption
                    key={option.id}
                    scope="effort"
                    label={option.label}
                    hint={option.hint}
                    checked={effort === option.id}
                    autoFocus={effort === option.id}
                    onSelect={() => chooseEffort(option.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Popover>
    </div>
  )
}

interface MenuOptionProps {
  readonly scope: 'model' | 'effort'
  readonly label: string
  /** Null where nothing published a description — the row stays label-only. */
  readonly hint: string | null
  readonly checked: boolean
  readonly autoFocus?: boolean
  readonly onSelect: () => void
}

function MenuOption({
  scope,
  label,
  hint,
  checked,
  autoFocus,
  onSelect
}: MenuOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      data-menu={scope}
      aria-checked={checked}
      autoFocus={autoFocus}
      onClick={onSelect}
      className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-raised focus-visible:bg-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--text-ui)] text-ink">{label}</span>
        {hint ? (
          <span className="block text-[length:var(--text-micro)] leading-snug text-faint">
            {hint}
          </span>
        ) : null}
      </span>
      {checked ? (
        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
      ) : (
        <span aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      )}
    </button>
  )
}
