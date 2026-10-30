import { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Sliders,
  X
} from 'lucide-react'
import {
  EFFORTS,
  MODELS,
  type Conversation,
  type EffortId,
  type ModelId,
  type Project,
  type ProjectPatch
} from '@shared/types'
import { LIMITS } from '@shared/ipc'
import { shortenPath } from '@renderer/lib/format'
import { ConversationRow } from './ConversationRow'

/** The CLI picks for itself when a project names no preference. */
const INHERIT = 'inherit'

const MODEL_OPTIONS = [
  { id: INHERIT, label: 'App default' },
  ...MODELS.map((model) => ({ id: model.id as string, label: model.label }))
]

const EFFORT_OPTIONS = [
  { id: INHERIT, label: 'App default' },
  ...EFFORTS.map((effort) => ({ id: effort.id as string, label: effort.label }))
]

interface ProjectGroupProps {
  /** null is the "Unfiled" bucket: chats whose project was removed. */
  readonly project: Project | null
  readonly items: readonly Conversation[]
  readonly collapsed: boolean
  readonly activeId: number | null
  readonly onToggle: () => void
  readonly onSelect: (id: number) => void
  readonly onDelete: (id: number) => void
  readonly onNewChat: (projectId: number | null) => void
  readonly onUpdate: (id: number, patch: ProjectPatch) => void
  readonly onRemove: (id: number) => void
}

export function ProjectGroup({
  project,
  items,
  collapsed,
  activeId,
  onToggle,
  onSelect,
  onDelete,
  onNewChat,
  onUpdate,
  onRemove
}: ProjectGroupProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)

  return (
    <section className="pb-1">
      <div className="group relative flex items-center">
        <button
          type="button"
          onClick={onToggle}
          title={project ? project.path : 'Chats that belong to no project'}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-pill)] px-2 py-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="size-3 shrink-0 text-faint" />
          ) : (
            <ChevronDown aria-hidden className="size-3 shrink-0 text-faint" />
          )}
          {project ? (
            <Folder aria-hidden className="size-3.5 shrink-0 text-muted" />
          ) : (
            <FolderOpen aria-hidden className="size-3.5 shrink-0 text-faint" />
          )}
          <span className="truncate text-[length:var(--text-ui)] text-muted group-hover:text-ink">
            {project ? project.name : 'Unfiled'}
          </span>
        </button>

        <span className="shrink-0 pr-1.5 font-mono text-[length:var(--text-micro)] text-faint transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
          {items.length}
        </span>

        <div className="absolute right-0 flex items-center gap-0.5 bg-rail pl-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 focus-within:opacity-100">
          <GroupAction label="New chat here" onClick={() => onNewChat(project?.id ?? null)}>
            <Plus aria-hidden className="size-3.5" />
          </GroupAction>
          {project ? (
            <GroupAction
              label={editing ? 'Close project settings' : 'Project settings'}
              onClick={() => setEditing((open) => !open)}
            >
              <Sliders aria-hidden className="size-3.5" />
            </GroupAction>
          ) : null}
        </div>
      </div>

      {project && editing ? (
        <ProjectSettings
          project={project}
          onUpdate={(patch) => onUpdate(project.id, patch)}
          onRemove={() => {
            setEditing(false)
            onRemove(project.id)
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {collapsed ? null : (
        <ul className="mt-0.5 space-y-0.5">
          {items.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
          {items.length === 0 ? (
            <li className="px-3 py-1.5 text-[length:var(--text-micro)] text-faint">
              No chats yet.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}

interface GroupActionProps {
  readonly label: string
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function GroupAction({ label, onClick, children }: GroupActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex size-5 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

interface ProjectSettingsProps {
  readonly project: Project
  readonly onUpdate: (patch: ProjectPatch) => void
  readonly onRemove: () => void
  readonly onClose: () => void
}

/** The project's own name, folder and run defaults, inline under its header. */
function ProjectSettings({
  project,
  onUpdate,
  onRemove,
  onClose
}: ProjectSettingsProps): React.JSX.Element {
  const [name, setName] = useState(project.name)
  const trimmed = name.trim()
  const renamed = trimmed.length > 0 && trimmed !== project.name

  return (
    <div className="mt-1 mb-1.5 ml-3 rounded-[var(--radius-md)] border border-line bg-surface p-2">
      <div className="flex items-center gap-1">
        <input
          aria-label="Project name"
          value={name}
          maxLength={LIMITS.projectNameMaxLength}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && renamed) onUpdate({ name: trimmed })
            if (event.key === 'Escape') onClose()
          }}
          className="selectable min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-canvas px-2 py-1 text-[length:var(--text-micro)] text-ink"
        />
        <GroupAction
          label={renamed ? 'Rename project' : 'Close'}
          onClick={() => (renamed ? onUpdate({ name: trimmed }) : onClose())}
        >
          {renamed ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <X aria-hidden className="size-3.5" />
          )}
        </GroupAction>
      </div>

      <p title={project.path} className="mt-1.5 truncate font-mono text-[0.625rem] text-faint">
        {shortenPath(project.path)}
      </p>

      <div className="mt-2 grid gap-1">
        <MiniPicker
          label="Model"
          value={project.defaultModel ?? INHERIT}
          options={MODEL_OPTIONS}
          onChange={(value) =>
            onUpdate({ defaultModel: value === INHERIT ? null : (value as ModelId) })
          }
        />
        <MiniPicker
          label="Effort"
          value={project.defaultEffort ?? INHERIT}
          options={EFFORT_OPTIONS}
          onChange={(value) =>
            onUpdate({ defaultEffort: value === INHERIT ? null : (value as EffortId) })
          }
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        title="Remove project"
        className="group/remove mt-2 w-full rounded-[var(--radius-sm)] px-2 py-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-raised"
      >
        <span className="block text-[length:var(--text-micro)] text-muted group-hover/remove:text-danger">
          Remove project
        </span>
        <span className="block text-[0.625rem] text-faint">Its chats move to Unfiled</span>
      </button>
    </div>
  )
}

interface MiniPickerProps {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly id: string; readonly label: string }[]
  readonly onChange: (value: string) => void
}

function MiniPicker({ label, value, options, onChange }: MiniPickerProps): React.JSX.Element {
  return (
    <label className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[length:var(--text-micro)] text-faint">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-canvas px-1.5 py-1 text-[length:var(--text-micro)] text-ink transition-colors duration-[var(--duration-fast)] hover:border-line-strong"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
