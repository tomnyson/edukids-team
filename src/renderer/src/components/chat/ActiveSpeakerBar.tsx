import React from 'react'
import { Sparkles, StopCircle } from 'lucide-react'

interface ActiveSpeakerBarProps {
  readonly activeSpeaker: string | null
  readonly phaseDescription?: string | null
  readonly onStop?: () => void
}

export function ActiveSpeakerBar({
  activeSpeaker,
  phaseDescription,
  onStop
}: ActiveSpeakerBarProps): React.JSX.Element | null {
  if (!activeSpeaker) return null

  return (
    <div className="sticky bottom-3 z-20 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-full border border-cyan-500/40 bg-zinc-950/90 px-4 py-2 shadow-lg shadow-cyan-950/40 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2.5 font-mono text-xs">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
        </span>

        <Sparkles aria-hidden className="size-3.5 shrink-0 text-cyan-400" />

        <div className="truncate text-zinc-200">
          <span className="font-semibold text-cyan-300">{activeSpeaker}</span>
          {phaseDescription ? (
            <span className="ml-1.5 text-zinc-400">— {phaseDescription}</span>
          ) : (
            <span className="ml-1.5 text-zinc-400">is reasoning...</span>
          )}
        </div>
      </div>

      {onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          <StopCircle aria-hidden className="size-3" />
          Stop
        </button>
      ) : null}
    </div>
  )
}
