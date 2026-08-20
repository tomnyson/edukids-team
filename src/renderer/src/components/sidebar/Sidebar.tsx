import { useCallback, useMemo, useState } from 'react'
import { FolderPlus, ListCollapse, PanelLeftClose, Plus, Search, Settings2 } from 'lucide-react'
import type { Conversation, Project, ProjectPatch } from '@shared/types'
import { ClaudeMark } from '@renderer/components/ui/ClaudeMark'
import { ProjectGroup } from './ProjectGroup'

interface SidebarProps {
  readonly conversations: readonly Conversation[]
  readonly projects: readonly Project[]
  readonly activeId: number | null
  readonly claudeBinary: string | null | undefined
  readonly onSelect: (id: number) => void
  readonly onCreate: (projectId: number | null) => void
  readonly onDelete: (id: number) => void
  readonly onAddProject: () => void
  readonly onUpdateProject: (id: number, patch: ProjectPatch) => void
  readonly onRemoveProject: (id: number) => void
  readonly onCollapse: () => void
  readonly onOpenSettings: () => void
}

interface Group {
  /** Stable across renames, so a collapsed group stays collapsed. */
  readonly key: string
  readonly project: Project | null
  readonly items: readonly Conversation[]
}

/**
 * Every project gets a group even when it holds no chats yet — an empty folder
 * you just added has to be visible to be useful. "Unfiled" only appears when
 * something is actually in it, and always comes last.
 */
function groupByProject(
  projects: readonly Project[],
  conversations: readonly Conversation[]
): readonly Group[] {
  const buckets = new Map<number | null, Conversation[]>()

  for (const conversation of conversations) {
    const bucket = buckets.get(conversation.projectId)
    if (bucket) bucket.push(conversation)
    else buckets.set(conversation.projectId, [conversation])
  }

  const groups: Group[] = projects.map((project) => ({
    key: `project-${project.id}`,
    project,
    items: buckets.get(project.id) ?? []
  }))

  const unfiled = buckets.get(null)
  if (unfiled?.length) groups.push({ key: 'unfiled', project: null, items: unfiled })

  return groups
}

export function Sidebar({
  conversations,
  projects,
  activeId,
  claudeBinary,
  onSelect,
  onCreate,
  onDelete,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onCollapse,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groupByProject(projects, conversations)

    // A search is about the chats, so projects that match nothing drop out.
    const matching = conversations.filter((item) => item.title.toLowerCase().includes(needle))
    return groupByProject(projects, matching).filter((group) => group.items.length > 0)
  }, [conversations, projects, query])

  const toggleGroup = useCallback((key: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  const allCollapsed = groups.length > 0 && groups.every((group) => collapsedGroups.has(group.key))

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
          onClick={() => onCreate(null)}
          className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface py-1.5 text-[length:var(--text-ui)] font-medium text-muted transition-all duration-[var(--duration-fast)] hover:border-accent-dim hover:bg-raised hover:text-ink active:scale-[0.99]"
        >
          <Plus aria-hidden className="size-3.5" />
          New chat
        </button>
      </div>

      <div className="flex h-7 items-center gap-1 px-3">
        <h2 className="text-[length:var(--text-micro)] text-faint">Projects</h2>
        <div className="ml-auto flex items-center gap-0.5">
          <RailAction label="Add project folder" onClick={onAddProject}>
            <FolderPlus aria-hidden className="size-3.5" />
          </RailAction>
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
            label={allCollapsed ? 'Expand all projects' : 'Collapse all projects'}
            onClick={() =>
              setCollapsedGroups(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))
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
            {query ? 'Nothing matches that.' : 'No projects yet — add a folder to start one.'}
          </p>
        ) : (
          groups.map((group) => (
            <ProjectGroup
              key={group.key}
              project={group.project}
              items={group.items}
              collapsed={collapsedGroups.has(group.key)}
              activeId={activeId}
              onToggle={() => toggleGroup(group.key)}
              onSelect={onSelect}
              onDelete={onDelete}
              onNewChat={onCreate}
              onUpdate={onUpdateProject}
              onRemove={onRemoveProject}
            />
          ))
        )}
      </div>

      <footer className="flex items-center gap-2 px-3 py-2.5">
        <p
          title={claudeBinary ?? undefined}
          className="flex min-w-0 flex-1 items-center gap-2 font-mono text-[length:var(--text-micro)] tracking-wide text-faint"
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
        <button
          type="button"
          id="open-settings"
          onClick={onOpenSettings}
          title="Settings"
          className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
        >
          <Settings2 aria-hidden className="size-4" />
          <span className="sr-only">Settings</span>
        </button>
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
