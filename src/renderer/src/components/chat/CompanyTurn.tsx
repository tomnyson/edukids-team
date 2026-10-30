import type { CompanyMessage } from '@shared/types'
import { SpeakerBadge } from './SpeakerBadge'
import { ReasoningBlock } from './ReasoningBlock'
import { Markdown } from './Markdown'
import { UserBubble } from './UserBubble'
import { relativeTime } from '@renderer/lib/format'
import type { PendingCompanyTurn } from '@renderer/hooks/useCompanyChatStream'

// Lines the reply up with the speaker's name, past the size-7 avatar and its gap.
const BODY_INDENT = 'pl-9'

interface CompanyTurnProps {
  readonly message: CompanyMessage
}

export function CompanyTurn({ message }: CompanyTurnProps): React.JSX.Element {
  if (message.senderType === 'user') {
    return (
      <article className="flex flex-col items-end gap-1.5">
        <UserBubble text={message.content} />
        <span className="pr-2 text-[length:var(--text-micro)] text-faint">
          {relativeTime(message.createdAt)}
        </span>
      </article>
    )
  }

  return (
    <article className="space-y-2">
      <SpeakerBadge
        senderType={message.senderType}
        memberName={message.memberName}
        memberRole={message.memberRole}
        memberColor={message.memberColor}
        phase={message.phase}
      />

      <div className={`space-y-3 ${BODY_INDENT}`}>
        {message.reasoningContent ? <ReasoningBlock reasoning={message.reasoningContent} /> : null}

        <div className="text-[length:var(--text-body)] text-ink">
          <Markdown>{message.content}</Markdown>
        </div>

        <div className="flex items-center gap-3 text-[length:var(--text-micro)] text-faint tabular-nums">
          <span>{relativeTime(message.createdAt)}</span>
          {message.durationMs ? <span>{(message.durationMs / 1000).toFixed(1)}s</span> : null}
        </div>
      </div>
    </article>
  )
}

interface PendingCompanyTurnProps {
  readonly pending: PendingCompanyTurn
}

export function PendingCompanyTurnView({ pending }: PendingCompanyTurnProps): React.JSX.Element {
  return (
    <article className="space-y-2">
      <SpeakerBadge
        senderType="member"
        memberName={pending.memberName}
        memberRole={pending.memberRole}
        memberColor={pending.memberColor}
      />

      <div className={`space-y-3 ${BODY_INDENT}`}>
        {pending.reasoning ? (
          <ReasoningBlock reasoning={pending.reasoning} isStreaming={pending.isStreaming} />
        ) : null}

        <div className="text-[length:var(--text-body)] text-ink">
          {pending.content ? (
            <Markdown highlight={false}>{pending.content}</Markdown>
          ) : (
            <p className="text-[length:var(--text-meta)] text-muted motion-safe:animate-pulse">
              Writing a reply…
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
