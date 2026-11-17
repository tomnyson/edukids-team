import { LoaderCircle, Mic, Square } from 'lucide-react'
import type { DictationPhase } from '@renderer/hooks/useDictation'

interface MicButtonProps {
  readonly phase: DictationPhase
  readonly disabled: boolean
  readonly onClick: () => void
}

const LABELS: Record<DictationPhase, string> = {
  idle: 'Dictate (⌘⇧M)',
  starting: 'Opening the microphone — click to cancel',
  recording: 'Stop and transcribe (⌘⇧M)',
  transcribing: 'Transcribing — click to cancel'
}

const BASE =
  'relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent'

const TONE: Record<DictationPhase, string> = {
  idle: 'text-muted hover:bg-raised hover:text-ink',
  starting: 'bg-raised text-ink',
  recording: 'bg-danger/12 text-danger hover:bg-danger/20',
  transcribing: 'bg-raised text-muted hover:text-ink'
}

function PhaseIcon({ phase }: { readonly phase: DictationPhase }): React.JSX.Element {
  if (phase === 'recording') return <Square aria-hidden className="size-3 fill-current" />
  if (phase === 'transcribing') {
    return <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
  }
  return (
    <Mic
      aria-hidden
      className={`size-4 ${phase === 'starting' ? 'motion-safe:animate-pulse' : ''}`}
    />
  )
}

/**
 * Dictation in one button: a mic at rest, a red stop square with a live ring while
 * recording, a spinner while the clip is transcribed. Pressing it never steals the
 * prompt's focus, so the transcript lands where the caret was.
 */
export function MicButton({ phase, disabled, onClick }: MicButtonProps): React.JSX.Element {
  const recording = phase === 'recording'
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      disabled={disabled && phase === 'idle'}
      aria-pressed={recording}
      title={LABELS[phase]}
      className={`${BASE} ${TONE[phase]}`}
    >
      {recording ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-danger/60 motion-safe:animate-ping"
        />
      ) : null}
      <PhaseIcon phase={phase} />
      <span className="sr-only">{LABELS[phase]}</span>
    </button>
  )
}
