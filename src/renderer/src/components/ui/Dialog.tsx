import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Everything the browser will let us move focus to inside the panel. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  readonly title: string
  readonly onClose: () => void
  readonly children: React.ReactNode
}

/**
 * A modal panel. Focus enters it on open, cannot leave it while it is up, and
 * returns to whatever opened it on close — Escape and the backdrop both close.
 */
export function Dialog({ title, onClose, children }: DialogProps): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    opener.current = document.activeElement
    // The panel itself, not the first control: Tab still walks the trap, and no
    // row is left wearing a focus ring that reads as a selection.
    panel.current?.focus()

    return () => {
      // The opener may have unmounted; focusing a detached node is harmless.
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const stops = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      if (stops.length === 0) return

      const edge = event.shiftKey ? stops[0] : stops[stops.length - 1]
      if (document.activeElement !== edge) return

      // Wrap instead of escaping to the window chrome behind the dialog.
      event.preventDefault()
      ;(event.shiftKey ? stops[stops.length - 1] : stops[0]).focus()
    },
    [onClose]
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklch,var(--c-void)_62%,transparent)] p-6 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // The panel takes focus on open only to anchor the trap; the ring that
        // Chromium draws around a programmatically focused div is noise.
        style={{ outline: 'none' }}
        className="relative flex h-[min(22rem,100%)] w-[min(44rem,100%)] overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-surface shadow-[0_28px_70px_-20px_var(--c-shadow)]"
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute top-4 right-4 z-10 flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink"
        >
          <X aria-hidden className="size-4" />
          <span className="sr-only">Close settings</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
