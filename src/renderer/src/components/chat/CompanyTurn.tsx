import React from 'react'
import type { CompanyMessage } from '@shared/types'
import { SpeakerBadge } from './SpeakerBadge'
import { ReasoningBlock } from './ReasoningBlock'
import { Markdown } from './Markdown'
import { relativeTime } from '@renderer/lib/format'
import type { PendingCompanyTurn } from '@renderer/hooks/useCompanyChatStream'

interface CompanyTurnProps {
  readonly message: CompanyMessage
}

export function CompanyTurn({ message }: CompanyTurnProps): React.JSX.Element {
  return (
    <article className="space-y-3 py-2 border-b border-zinc-800/40 last:border-b-0">
      <SpeakerBadge
        senderType={message.senderType}
        memberName={message.memberName}
        memberRole={message.memberRole}
        memberColor={message.memberColor}
        phase={message.phase}
      />

      {message.reasoningContent ? (
        <ReasoningBlock reasoning={message.reasoningContent} />
      ) : null}

      <div className="text-[length:var(--text-body)] text-ink pl-1">
        <Markdown>{message.content}</Markdown>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500 pl-1">
        <span>{relativeTime(message.createdAt)}</span>
        {message.durationMs ? <span>· {(message.durationMs / 1000).toFixed(1)}s</span> : null}
      </div>
    </article>
  )
}

interface PendingCompanyTurnProps {
  readonly pending: PendingCompanyTurn
}

export function PendingCompanyTurnView({ pending }: PendingCompanyTurnProps): React.JSX.Element {
  return (
    <article className="space-y-3 py-2 border-b border-zinc-800/40">
      <SpeakerBadge
        senderType="member"
        memberName={pending.memberName}
        memberRole={pending.memberRole}
        memberColor={pending.memberColor}
      />

      {pending.reasoning ? (
        <ReasoningBlock reasoning={pending.reasoning} isStreaming={pending.isStreaming} />
      ) : null}

      <div className="text-[length:var(--text-body)] text-ink pl-1">
        {pending.content ? (
          <Markdown highlight={false}>{pending.content}</Markdown>
        ) : (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400/80 animate-pulse">
            <span>Generating response...</span>
          </div>
        )}
      </div>
    </article>
  )
}
