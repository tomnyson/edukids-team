import { useEffect, useRef } from 'react'

/** Why the popover is closing — a click elsewhere must not steal that click's focus. */
export interface CloseIntent {
  readonly restoreFocus: boolean
}

interface PopoverProps {
  readonly open: boolean
  /** Names the panel for screen readers; the trigger keeps its own label. */
  readonly label: string
  /** The trigger. Presses on it are ignored here so it can toggle itself. */
  readonly anchorRef: React.RefObject<HTMLElement | null>
  readonly onClose: (intent: CloseIntent) => void
  readonly children: React.ReactNode
}

/**
 * A panel anchored to the element it is rendered next to — the caller supplies a
 * `relative` wrapper, so there is no measuring and nothing to re-position on
 * scroll. It owns only the three behaviours a menu cannot go without: closing on
 * an outside press, closing on Escape, and telling the caller which of the two
 * happened so focus lands in the right place.
 */
export function Popover({
  open,
  label,
  anchorRef,
  onClose,
  children
}: PopoverProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      // The trigger toggles itself; closing here too would reopen on the same press.
      if (anchorRef.current?.contains(target)) return
      onClose({ restoreFocus: false })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose({ restoreFocus: true })
    }

    // Capture, so a press on a child that stops propagation still closes menus.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null

  // Fixed width, not min-width: the global `* { min-width: 0 }` reset is
  // unlayered, so it outranks Tailwind's layered `min-w-*` utilities.
  return (
    <div
      ref={panelRef}
      aria-label={label}
      className="absolute right-0 bottom-full z-30 mb-2 w-64 rounded-[var(--radius-lg)] border border-line-strong bg-surface py-1 shadow-[0_18px_44px_-14px_rgb(0_0_0/0.75)]"
    >
      {children}
    </div>
  )
}
