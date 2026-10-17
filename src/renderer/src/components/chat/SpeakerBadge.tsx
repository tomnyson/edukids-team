import React from 'react'
import { Bot, User, ShieldAlert } from 'lucide-react'
import type { SenderType } from '@shared/types'

interface SpeakerBadgeProps {
  readonly senderType: SenderType
  readonly memberName?: string | null
  readonly memberRole?: string | null
  readonly memberColor?: string | null
  readonly phase?: string | null
}

export function SpeakerBadge({
  senderType,
  memberName,
  memberRole,
  memberColor = '#00F0FF',
  phase
}: SpeakerBadgeProps): React.JSX.Element {
  if (senderType === 'user') {
    return (
      <div className="flex items-center gap-2 font-mono text-xs text-amber-400/90">
        <div className="flex size-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
          <User aria-hidden className="size-3" />
        </div>
        <span className="font-semibold tracking-wide">You</span>
      </div>
    )
  }

  const isModerator = senderType === 'moderator'
  const resolvedColor = isModerator ? '#FF7A00' : (memberColor ?? '#00F0FF')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex size-6 items-center justify-center rounded-md border text-xs shadow-xs"
        style={{
          borderColor: `${resolvedColor}40`,
          backgroundColor: `${resolvedColor}15`,
          color: resolvedColor
        }}
      >
        {isModerator ? (
          <ShieldAlert aria-hidden className="size-3.5" />
        ) : (
          <Bot aria-hidden className="size-3.5" />
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="font-semibold text-zinc-100">{memberName || 'Agent'}</span>
        {memberRole ? (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-tight"
            style={{
              backgroundColor: `${resolvedColor}20`,
              color: resolvedColor
            }}
          >
            {memberRole}
          </span>
        ) : null}

        {phase ? (
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {phase}
          </span>
        ) : null}
      </div>
    </div>
  )
}
