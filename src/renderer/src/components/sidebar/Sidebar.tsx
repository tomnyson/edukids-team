import { useCallback, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ListCollapse,
  Folder,
  PanelLeftClose,
  Plus,
  Search
} from 'lucide-react'
import type { Conversation } from '@shared/types'
import { fileName, shortenPath } from '@renderer/lib/format'
import { ClaudeMark } from '@renderer/components/ui/ClaudeMark'
import { ConversationRow } from './ConversationRow'

interface SidebarProps {
  readonly conversations: readonly Conversation[]
  readonly activeId: number | null
  readonly claudeBinary: string | null | undefined
  readonly onSelect: (id: number) => void
  readonly onCreate: () => void
  readonly onDelete: (id: number) => void
  readonly onCollapse: () => void
}

interface Group {
  readonly cwd: string
  readonly items: readonly Conversation[]
}

/** The home folder has no useful basename — it reads as `~`, like the chip does. */
function folderLabel(cwd: string): string {
  const shortened = shortenPath(cwd)
  return shortened === '~' ? '~' : fileName(cwd) || shortened
}

/** Conversations belong to the folder the CLI ran in, so the rail groups by it. */
function groupByFolder(conversations: readonly Conversation[]): readonly Group[] {
  const order: string[] = []
  const buckets = new Map<string, Conversation[]>()

  for (const conversation of conversations) {
    const existing = buckets.get(conversation.cwd)
    if (existing) {
      existing.push(conversation)
    } else {
      order.push(conversation.cwd)
      buckets.set(conversation.cwd, [conversation])
    }
  }

  return order.map((cwd) => ({ cwd, items: buckets.get(cwd) ?? [] }))
}

export function Sidebar({
  conversations,
  activeId,
  claudeBinary,
  onSelect,
  onCreate,
  onDelete,
  onCollapse
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = needle
      ? conversations.filter((item) => item.title.toLowerCase().includes(needle))
      : conversations
    return groupByFolder(matching)
  }, [conversations, query])

  const toggleFolder = useCallback((cwd: string): void => {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (!next.delete(cwd)) next.add(cwd)
      return next
    })
  }, [])

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsedFolders.has(g.cwd))

  return (
    <nav
      aria-label="Conversation history"
      className="flex w-[var(--rail-width)] shrink-0 flex-col border-r border-line bg-rail"
    >
      {/* Sits beside the macOS traffic lights, and doubles as the drag region. */}
      <div
        className="flex h-12 shrink-0 items-center gap-1.5 pr-2 pl-[4.75rem]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <ClaudeMark className="size-4 shrink-0 text-accent" />
        <span className="text-[0.8125rem] font-semibold tracking-tight text-ink">claude</span>
        <span className="rounded-[3px] bg-raised px-1 py-px font-mono text-[0.5625rem] tracking-[0.1em] text-muted uppercase">
          gui
        </span>
        <button
          type="button"
          onClick={onCollapse}
          title="Hide sidebar"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
        >
          <PanelLeftClose aria-hidden className="size-4" />
          <span className="sr-only">Hide sidebar</span>
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface py-1.5 text-[length:var(--text-ui)] font-medium text-muted transition-all duration-[var(--duration-fast)] hover:border-accent-dim hover:bg-raised hover:text-ink active:scale-[0.99]"
        >
          <Plus aria-hidden className="size-3.5" />
          New chat
        </button>
      </div>

      <div className="flex h-7 items-center gap-1 px-3">
        <h2 className="text-[length:var(--text-micro)] text-faint">Conversations</h2>
        <div className="ml-auto flex items-center gap-0.5">
          <RailAction
            label={searching ? 'Close search' : 'Search conversations'}
            active={searching}
            onClick={() => {
              setSearching((open) => !open)
              if (searching) setQuery('')
            }}
          >
            <Search aria-hidden className="size-3.5" />
          </RailAction>
          <RailAction
            label={allCollapsed ? 'Expand all folders' : 'Collapse all folders'}
            onClick={() =>
              setCollapsedFolders(allCollapsed ? new Set() : new Set(groups.map((g) => g.cwd)))
            }
          >
            <ListCollapse aria-hidden className="size-3.5" />
          </RailAction>
        </div>
      </div>

      {searching ? (
        <div className="px-3 pt-1.5">
          <label htmlFor="history-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="history-search"
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title"
            className="selectable w-full rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 font-mono text-[length:var(--text-micro)] text-ink placeholder:text-faint focus:border-line-strong [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1.5 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-[length:var(--text-micro)] text-faint">
            {query ? 'Nothing matches that.' : 'No conversations yet.'}
          </p>
        ) : (
          groups.map((group) => (
            <FolderGroup
              key={group.cwd}
              group={group}
              collapsed={collapsedFolders.has(group.cwd)}
              activeId={activeId}
              onToggle={toggleFolder}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <footer className="px-3 py-2.5">
        <p
          title={claudeBinary ?? undefined}
          className="flex items-center gap-2 font-mono text-[length:var(--text-micro)] tracking-wide text-faint"
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${claudeBinary === null ? 'bg-danger' : claudeBinary ? 'bg-ok' : 'bg-faint'}`}
          />
          {claudeBinary === undefined
            ? 'checking cli…'
            : claudeBinary === null
              ? 'cli not found'
              : 'cli ready'}
        </p>
      </footer>
    </nav>
  )
}

interface RailActionProps {
  readonly label: string
  readonly active?: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function RailAction({ label, active, onClick, children }: RailActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={`flex size-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink ${
        active ? 'text-accent' : 'text-faint'
      }`}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

interface FolderGroupProps {
  readonly group: Group
  readonly collapsed: boolean
  readonly activeId: number | null
  readonly onToggle: (cwd: string) => void
  readonly onSelect: (id: number) => void
  readonly onDelete: (id: number) => void
}

function FolderGroup({
  group,
  collapsed,
  activeId,
  onToggle,
  onSelect,
  onDelete
}: FolderGroupProps): React.JSX.Element {
  return (
    <section className="pb-1">
      <button
        type="button"
        onClick={() => onToggle(group.cwd)}
        title={group.cwd}
        aria-expanded={!collapsed}
        className="group flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface"
      >
        {collapsed ? (
          <ChevronRight aria-hidden className="size-3 shrink-0 text-faint" />
        ) : (
          <ChevronDown aria-hidden className="size-3 shrink-0 text-faint" />
        )}
        <Folder aria-hidden className="size-3.5 shrink-0 text-accent" />
        <span className="truncate text-[length:var(--text-ui)] text-muted group-hover:text-ink">
          {folderLabel(group.cwd)}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[length:var(--text-micro)] text-faint">
          {group.items.length}
        </span>
      </button>

      {collapsed ? null : (
        <ul className="mt-0.5 pl-3">
          {group.items.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
