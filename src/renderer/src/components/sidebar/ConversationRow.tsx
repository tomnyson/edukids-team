import { Trash2 } from 'lucide-react'
import type { Conversation } from '@shared/types'
import { relativeTime } from '@renderer/lib/format'

interface ConversationRowProps {
  readonly conversation: Conversation
  readonly active: boolean
  readonly onSelect: (id: number) => void
  readonly onDelete: (id: number) => void
}

export function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete
}: ConversationRowProps): React.JSX.Element {
  const detail = `${relativeTime(conversation.updatedAt)} · ${conversation.messageCount} ${
    conversation.messageCount === 1 ? 'turn' : 'turns'
  }`

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? 'true' : undefined}
        title={`${conversation.title}\n${detail}`}
        className={`w-full truncate rounded-[var(--radius-md)] px-2.5 py-1.5 pr-8 text-left text-[length:var(--text-ui)] leading-snug transition-colors duration-[var(--duration-fast)] ${
          active
            ? 'bg-surface text-ink'
            : 'text-muted hover:bg-[var(--c-surface)]/60 hover:text-ink'
        }`}
      >
        {conversation.title}
      </button>

      {/* The row is a single line, so the timestamp yields the space to the action. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[length:var(--text-micro)] text-faint transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0"
      >
        {conversation.messageCount > 0 ? conversation.messageCount : ''}
      </span>

      <button
        type="button"
        onClick={() => onDelete(conversation.id)}
        title="Delete conversation"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[var(--radius-sm)] p-1 text-faint opacity-0 transition-all duration-[var(--duration-fast)] group-hover:opacity-100 hover:bg-raised hover:text-danger focus-visible:opacity-100"
      >
        <Trash2 aria-hidden className="size-3.5" />
        <span className="sr-only">Delete {conversation.title}</span>
      </button>
    </li>
  )
}
