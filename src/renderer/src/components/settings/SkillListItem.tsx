import { useState } from 'react'
import { AlertTriangle, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { SkillSummary } from '@shared/skills'

const ICON_BUTTON =
  'rounded-[var(--radius-md)] p-1.5 text-faint transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink focus-visible:text-ink'

interface SkillListItemProps {
  readonly skill: SkillSummary
  readonly onReveal: (ref: string) => void
  /** Only app skills can be changed; Claude Code's own are left alone. */
  readonly onEdit?: (skill: SkillSummary) => void
  readonly onDelete?: (dir: string) => void
}

export function SkillListItem({
  skill,
  onReveal,
  onEdit,
  onDelete
}: SkillListItemProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="group flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[length:var(--text-ui)] text-ink">{skill.name}</span>
          {skill.name === skill.dir ? null : (
            <span className="truncate font-mono text-[length:var(--text-micro)] text-faint">
              {skill.dir}
            </span>
          )}
        </p>
        <SkillLine skill={skill} />
        {confirming && onDelete ? (
          <ConfirmDelete
            onConfirm={() => {
              setConfirming(false)
              onDelete(skill.dir)
            }}
            onKeep={() => setConfirming(false)}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity duration-[var(--duration-fast)] group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onReveal(skill.ref)}
          title="Show in Finder"
          className={ICON_BUTTON}
        >
          <FolderOpen aria-hidden className="size-3.5" />
          <span className="sr-only">Show {skill.name} in Finder</span>
        </button>
        {onEdit ? (
          <button type="button" onClick={() => onEdit(skill)} title="Edit" className={ICON_BUTTON}>
            <Pencil aria-hidden className="size-3.5" />
            <span className="sr-only">Edit {skill.name}</span>
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Move to Trash"
            className={`${ICON_BUTTON} hover:text-danger`}
          >
            <Trash2 aria-hidden className="size-3.5" />
            <span className="sr-only">Delete {skill.name}</span>
          </button>
        ) : null}
      </div>
    </li>
  )
}

/** The description, or why members skip this skill. */
function SkillLine({ skill }: { readonly skill: SkillSummary }): React.JSX.Element {
  if (skill.problem) {
    return (
      <p className="mt-0.5 flex items-start gap-1 text-[length:var(--text-micro)] text-warn">
        <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" />
        <span>{skill.problem} Members skip it until it is fixed.</span>
      </p>
    )
  }
  return (
    <p className="mt-0.5 line-clamp-2 text-[length:var(--text-micro)] text-muted">
      {skill.description}
    </p>
  )
}

interface ConfirmDeleteProps {
  readonly onConfirm: () => void
  readonly onKeep: () => void
}

function ConfirmDelete({ onConfirm, onKeep }: ConfirmDeleteProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Confirm delete"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-danger-dim bg-canvas px-2.5 py-1.5"
    >
      <span className="min-w-0 flex-1 text-[length:var(--text-micro)] text-muted">
        Move to the Trash? Members that use it will lose it.
      </span>
      <button
        type="button"
        autoFocus
        onClick={onKeep}
        className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-micro)] text-muted hover:bg-raised hover:text-ink"
      >
        Keep
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-[var(--radius-sm)] bg-danger px-2 py-0.5 text-[length:var(--text-micro)] text-[var(--c-canvas)] hover:opacity-90"
      >
        Move to Trash
      </button>
    </div>
  )
}
