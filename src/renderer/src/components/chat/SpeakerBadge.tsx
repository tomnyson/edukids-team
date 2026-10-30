import type { SenderType } from '@shared/types'
import { BotAvatar } from '@renderer/components/ui/BotFace'

interface SpeakerBadgeProps {
  readonly senderType: SenderType
  readonly memberName?: string | null
  readonly memberRole?: string | null
  readonly memberColor?: string | null
  readonly phase?: string | null
}

const MODERATOR_COLOR = 'var(--c-bot-moderator)'
const MEMBER_COLOR = 'var(--c-bot-default)'

function speakerColor(senderType: SenderType, memberColor?: string | null): string | null {
  if (senderType === 'moderator') return MODERATOR_COLOR
  if (senderType === 'system') return null
  return memberColor || MEMBER_COLOR
}

/** Who is talking: the bot's face in its own colour, then its name and role. */
export function SpeakerBadge({
  senderType,
  memberName,
  memberRole,
  memberColor,
  phase
}: SpeakerBadgeProps): React.JSX.Element {
  const name = senderType === 'user' ? 'You' : memberName || 'Agent'
  const role = senderType === 'moderator' && !memberRole ? 'Moderator' : memberRole

  return (
    <div className="flex min-w-0 items-center gap-2">
      <BotAvatar seed={name} color={speakerColor(senderType, memberColor)} size="sm" />
      <span className="truncate text-[length:var(--text-ui)] font-semibold text-ink">{name}</span>
      {role ? (
        <span className="truncate text-[length:var(--text-micro)] text-faint">{role}</span>
      ) : null}
      {phase ? (
        <span className="shrink-0 rounded-[var(--radius-pill)] bg-raised px-2 py-0.5 text-[length:var(--text-micro)] text-muted">
          {phase}
        </span>
      ) : null}
    </div>
  )
}
