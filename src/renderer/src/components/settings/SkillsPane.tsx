import { useState } from 'react'
import { FolderInput, Plus, Search } from 'lucide-react'
import type { Result } from '@shared/types'
import type { SkillDraft, SkillSummary } from '@shared/skills'
import { useSkills } from '@renderer/hooks/useSkills'
import { filterSkills } from '@renderer/lib/skills'
import { SkillEditor } from './SkillEditor'
import { SkillListItem } from './SkillListItem'

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly draft: SkillDraft }

const LIST: View = { kind: 'list' }

const BUTTON =
  'flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:text-ink'

/** A failure's message, or nothing for a cancelled folder pick. */
function failureNote(result: Result<unknown>): string | null {
  return result.ok || result.error.code === 'CANCELLED' ? null : result.error.message
}

/**
 * Skills that company members can carry. Claude Code's own (`~/.claude/skills`) are listed
 * read-only; the app's library can be written, imported into and deleted from.
 */
export function SkillsPane(): React.JSX.Element {
  const library = useSkills()
  const [view, setView] = useState<View>(LIST)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState<string | null>(null)

  if (view.kind !== 'list') {
    const editing = view.kind === 'edit' ? view.draft : null
    return (
      <section aria-label="Skills">
        <SkillEditor
          editing={editing}
          onSave={(draft) =>
            editing ? library.update(editing.name, draft) : library.create(draft)
          }
          onDone={() => setView(LIST)}
        />
      </section>
    )
  }

  const startEdit = async (skill: SkillSummary): Promise<void> => {
    setNote(null)
    const result = await library.load(skill.ref)
    if (!result.ok) {
      setNote(result.error.message)
      return
    }
    const { dir, description, body, problem } = result.data
    // Nothing was read past the problem, so saving would throw the file's contents away
    if (problem && body === '') {
      setNote(`${problem} Fix it in Finder instead.`)
      return
    }
    setView({ kind: 'edit', draft: { name: dir, description, body } })
  }

  /** Shows how a change went; `done` is null when success needs no word. */
  const run = async (pending: Promise<Result<unknown>>, done: string | null): Promise<void> => {
    setNote(null)
    const result = await pending
    setNote(result.ok ? done : failureNote(result))
  }

  const shown = filterSkills(library.skills ?? [], query)
  const loading = library.skills === null
  const reveal = (ref: string): void => void run(library.reveal(ref), null)

  return (
    <section aria-label="Skills" className="flex flex-col gap-4">
      <Toolbar
        query={query}
        onQuery={setQuery}
        onImport={() => void run(library.importFolder(), 'Skill imported.')}
        onNew={() => setView({ kind: 'new' })}
      />
      {note || library.error ? (
        <p role="status" className="text-[length:var(--text-micro)] text-muted">
          {note ?? library.error}
        </p>
      ) : null}

      <SkillGroup
        title="In this app"
        hint="Yours to edit. Attach them to members under Manage AI Companies."
        empty={query ? 'No match.' : 'None yet. Write one, or import a folder with a SKILL.md.'}
        skills={shown.filter((skill) => skill.source === 'app')}
        loading={loading}
        onReveal={reveal}
        onEdit={(skill) => void startEdit(skill)}
        onDelete={(dir) => void run(library.remove(dir), 'Moved to the Trash.')}
      />
      <SkillGroup
        title="From Claude Code"
        hint="Read-only. These live in ~/.claude/skills."
        empty={query ? 'No match.' : 'No skills in ~/.claude/skills.'}
        skills={shown.filter((skill) => skill.source === 'user')}
        loading={loading}
        onReveal={reveal}
      />
    </section>
  )
}

interface ToolbarProps {
  readonly query: string
  readonly onQuery: (query: string) => void
  readonly onImport: () => void
  readonly onNew: () => void
}

function Toolbar({ query, onQuery, onImport, onNew }: ToolbarProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 transition-colors duration-[var(--duration-fast)] focus-within:border-line-strong">
        <Search aria-hidden className="size-3.5 shrink-0 text-faint" />
        <span className="sr-only">Search skills</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search skills"
          className="min-w-0 flex-1 bg-transparent text-[length:var(--text-ui)] text-ink placeholder:text-faint focus:outline-none"
        />
      </label>
      <button type="button" onClick={onImport} className={BUTTON}>
        <FolderInput aria-hidden className="size-3.5" />
        Import
      </button>
      <button
        type="button"
        onClick={onNew}
        className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-2.5 py-1.5 text-[length:var(--text-ui)] text-[var(--c-canvas)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
      >
        <Plus aria-hidden className="size-3.5" />
        New
      </button>
    </div>
  )
}

interface SkillGroupProps {
  readonly title: string
  readonly hint: string
  readonly empty: string
  readonly skills: readonly SkillSummary[]
  readonly loading: boolean
  readonly onReveal: (ref: string) => void
  readonly onEdit?: (skill: SkillSummary) => void
  readonly onDelete?: (dir: string) => void
}

function SkillGroup({
  title,
  hint,
  empty,
  skills,
  loading,
  onReveal,
  onEdit,
  onDelete
}: SkillGroupProps): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
        <h3 className="text-[length:var(--text-micro)] tracking-wide text-faint uppercase">
          {title}
          <span className="ml-1.5 tabular-nums">{loading ? '' : skills.length}</span>
        </h3>
        <p className="truncate text-[length:var(--text-micro)] text-faint">{hint}</p>
      </div>
      {loading ? (
        <p className="py-3 text-[length:var(--text-micro)] text-faint">Loading…</p>
      ) : skills.length === 0 ? (
        <p className="py-3 text-[length:var(--text-micro)] text-faint">{empty}</p>
      ) : (
        <ul>
          {skills.map((skill) => (
            <SkillListItem
              key={skill.ref}
              skill={skill}
              onReveal={onReveal}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
