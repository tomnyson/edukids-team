import { Square } from 'lucide-react'
import { BotAvatar } from '@renderer/components/ui/BotFace'

interface ActiveSpeakerBarProps {
  readonly activeSpeaker: string | null
  readonly phaseDescription?: string | null
  readonly onStop?: () => void
}

/**
 * Floats above the composer while a bot holds the floor, with a way to cut it off. It also shows
 * for work between turns, such as condensing notes, so Stop is always in reach.
 */
export function ActiveSpeakerBar({
  activeSpeaker,
  phaseDescription,
  onStop
}: ActiveSpeakerBarProps): React.JSX.Element | null {
  if (!activeSpeaker && !phaseDescription) return null

  return (
    <div
      role="status"
      className="sticky bottom-3 z-20 mx-auto mb-2 flex max-w-lg items-center justify-between gap-3 rounded-[var(--radius-pill)] border border-line-strong bg-surface/90 py-1.5 pr-1.5 pl-2 shadow-[0_12px_32px_-14px_var(--c-shadow)] backdrop-blur-md"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <BotAvatar seed={activeSpeaker ?? 'meeting'} size="xs" />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-ok opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-ok ring-2 ring-surface" />
          </span>
        </span>

        <p className="truncate text-[length:var(--text-ui)] text-muted">
          {activeSpeaker ? (
            <>
              <span className="font-semibold text-ink">{activeSpeaker}</span>{' '}
            </>
          ) : null}
          {phaseDescription ?? 'is thinking…'}
        </p>
      </div>

      {onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border border-line px-3 py-1 text-[length:var(--text-micro)] font-medium text-muted transition-colors duration-[var(--duration-fast)] hover:border-danger hover:text-danger"
        >
          <Square aria-hidden className="size-2.5 fill-current" />
          Stop
        </button>
      ) : null}
    </div>
  )
}
