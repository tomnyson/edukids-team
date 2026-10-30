import { Trash2 } from 'lucide-react'
import type { Conversation } from '@shared/types'
import { relativeTime } from '@renderer/lib/format'
import { BotAvatar } from '@renderer/components/ui/BotFace'

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
  const count = conversation.messageCount
  // Team chats keep their turns elsewhere, so a zero here would read as "empty".
  const turns = count > 0 ? `, ${count} ${count === 1 ? 'turn' : 'turns'}` : ''
  const detail = `${relativeTime(conversation.updatedAt)}${turns}`

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? 'true' : undefined}
        title={`${conversation.title}\n${detail}`}
        className={`flex w-full items-center gap-3 rounded-[var(--radius-xl)] px-2 py-2 pr-9 text-left transition-colors duration-[var(--duration-fast)] ${
          active ? 'bg-surface' : 'hover:bg-surface/60'
        }`}
      >
        {/* Chats get a neutral face: colour on screen always means a bot. */}
        <BotAvatar seed={conversation.id} size="md" active={active} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[length:var(--text-ui)] leading-snug font-semibold ${
              active ? 'text-ink' : 'text-muted group-hover:text-ink'
            }`}
          >
            {conversation.title}
          </span>
          <span className="block truncate text-[length:var(--text-micro)] leading-snug text-faint">
            {detail}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onDelete(conversation.id)}
        title="Delete conversation"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-faint opacity-0 transition-all duration-[var(--duration-fast)] group-hover:opacity-100 hover:bg-raised hover:text-danger focus-visible:opacity-100"
      >
        <Trash2 aria-hidden className="size-3.5" />
        <span className="sr-only">Delete {conversation.title}</span>
      </button>
    </li>
  )
}
