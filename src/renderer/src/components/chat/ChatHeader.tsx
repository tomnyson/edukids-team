import { APP_NAME } from '@shared/brand'
import { ChevronDown, PanelLeftOpen } from 'lucide-react'
import type { Company, Conversation } from '@shared/types'
import { shortenPath } from '@renderer/lib/format'
import { modeName } from '@renderer/lib/team'
import { AppMark } from '@renderer/components/ui/AppMark'
import { AvatarStack } from '@renderer/components/ui/BotFace'

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

interface ChatHeaderProps {
  readonly conversation: Conversation | null
  readonly company: Company | null
  readonly railHidden: boolean
  readonly onShowRail: () => void
  readonly onOpenCompany: () => void
  /** The Chat / Office switch, for chats that have an office. */
  readonly viewToggle?: React.ReactNode
}

/**
 * The title bar: who you are talking to, as one pill in the middle. It doubles
 * as the macOS drag region; its controls opt back out.
 */
export function ChatHeader({
  conversation,
  company,
  railHidden,
  onShowRail,
  onOpenCompany,
  viewToggle
}: ChatHeaderProps): React.JSX.Element {
  const members = company?.members ?? []

  return (
    <header
      className="grid h-14 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3 px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center">
        {railHidden ? (
          <button
            type="button"
            onClick={onShowRail}
            title="Show sidebar"
            style={NO_DRAG}
            className="ml-[4.5rem] flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
          >
            <PanelLeftOpen aria-hidden className="size-4" />
            <span className="sr-only">Show sidebar</span>
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpenCompany}
        title="Switch team"
        style={NO_DRAG}
        className="flex min-w-0 items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-surface/70 py-1 pr-3 pl-1 transition-colors duration-[var(--duration-fast)] [--avatar-ring:var(--c-surface)] hover:border-line-strong hover:bg-surface active:scale-[0.99]"
      >
        {members.length > 0 ? (
          <AvatarStack members={members} size="xs" />
        ) : (
          <AppMark className="size-5 shrink-0" />
        )}
        <h1 className="truncate text-[length:var(--text-ui)] font-semibold text-ink">
          {company ? company.name : (conversation?.title ?? APP_NAME)}
        </h1>
        {company ? (
          <span className="shrink-0 text-[length:var(--text-micro)] text-faint">
            {modeName(company)}
          </span>
        ) : null}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-faint" />
      </button>

      <div className="flex min-w-0 items-center justify-end gap-3">
        {viewToggle}
        {conversation ? (
          <span
            title={conversation.cwd}
            style={NO_DRAG}
            className="truncate font-mono text-[length:var(--text-micro)] text-faint"
          >
            {shortenPath(conversation.cwd)}
          </span>
        ) : null}
      </div>
    </header>
  )
}
