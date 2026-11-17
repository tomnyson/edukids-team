import { APP_NAME } from '@shared/brand'
import { useCallback, useMemo, useState } from 'react'
import { FolderPlus, ListCollapse, PanelLeftClose, Plus, Search } from 'lucide-react'
import type { Company, Conversation, Project, ProjectPatch } from '@shared/types'
import { AppMark } from '@renderer/components/ui/AppMark'
import { ProjectGroup } from './ProjectGroup'
import { SidebarFooter } from './SidebarFooter'

interface SidebarProps {
  readonly conversations: readonly Conversation[]
  readonly projects: readonly Project[]
  readonly activeId: number | null
  readonly claudeBinary: string | null | undefined
  readonly company: Company | null
  readonly onSelect: (id: number) => void
  readonly onCreate: (projectId: number | null) => void
  readonly onDelete: (id: number) => void
  readonly onAddProject: () => void
  readonly onUpdateProject: (id: number, patch: ProjectPatch) => void
  readonly onRemoveProject: (id: number) => void
  readonly onCollapse: () => void
  readonly onOpenSettings: () => void
  readonly onOpenCompany: () => void
  readonly onOpenProviders: () => void
  readonly onSoloMode: () => void
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
  company,
  onSelect,
  onCreate,
  onDelete,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onCollapse,
  onOpenSettings,
  onOpenCompany,
  onOpenProviders,
  onSoloMode
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
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
        className="flex h-12 shrink-0 items-center gap-2 pr-2 pl-[4.75rem]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <AppMark className="size-5 shrink-0" />
        <span className="text-[length:var(--text-ui)] font-semibold tracking-tight text-ink">
          {APP_NAME}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          title="Hide sidebar"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
        >
          <PanelLeftClose aria-hidden className="size-4" />
          <span className="sr-only">Hide sidebar</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pt-1 pb-3">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-pill)] bg-surface px-3 text-faint transition-shadow duration-[var(--duration-fast)] focus-within:text-muted focus-within:ring-1 focus-within:ring-line-strong">
          <Search aria-hidden className="size-4 shrink-0" />
          <span className="sr-only">Search conversations</span>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="Search"
            className="selectable w-full bg-transparent text-[length:var(--text-ui)] text-ink placeholder:text-faint focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
        </label>
        <button
          type="button"
          onClick={() => onCreate(null)}
          title="New chat"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-canvas transition-all duration-[var(--duration-fast)] hover:bg-accent-bright active:scale-95"
        >
          <Plus aria-hidden className="size-[1.125rem]" strokeWidth={2.25} />
          <span className="sr-only">New chat</span>
        </button>
      </div>

      <div className="flex h-7 items-center gap-1 px-4">
        <h2 className="text-[length:var(--text-micro)] font-medium text-faint">Projects</h2>
        <div className="ml-auto flex items-center gap-0.5">
          <RailAction label="Add project folder" onClick={onAddProject}>
            <FolderPlus aria-hidden className="size-3.5" />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-[length:var(--text-micro)] text-faint">
            {query ? 'Nothing matches that.' : 'No projects yet. Add a folder to start one.'}
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

      <SidebarFooter
        company={company}
        claudeBinary={claudeBinary}
        onOpenCompany={onOpenCompany}
        onOpenProviders={onOpenProviders}
        onOpenSettings={onOpenSettings}
        onSoloMode={onSoloMode}
      />
    </nav>
  )
}

interface RailActionProps {
  readonly label: string
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function RailAction({ label, onClick, children }: RailActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex size-6 items-center justify-center rounded-full text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
