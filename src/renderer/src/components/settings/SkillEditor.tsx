import { useState } from 'react'
import type { Result } from '@shared/types'
import type { SkillDetail, SkillDraft } from '@shared/skills'
import { finishSkillName, toSkillName } from '@renderer/lib/skills'

const FIELD =
  'selectable w-full rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-ui)] text-ink placeholder:text-faint transition-colors duration-[var(--duration-fast)] focus:border-line-strong focus:outline-none disabled:text-faint'
const LABEL = 'text-[length:var(--text-ui)] text-ink'
const HINT = 'text-[length:var(--text-micro)] text-faint'

const BODY_PLACEHOLDER = `Write what the member should do when this applies.

- Steps it should follow
- What a good answer looks like
- What to avoid`

interface SkillEditorProps {
  /** The skill being edited, or null for a new one. Its name cannot change. */
  readonly editing: SkillDraft | null
  readonly onSave: (draft: SkillDraft) => Promise<Result<SkillDetail>>
  readonly onDone: () => void
}

/** One form for writing a new app skill or changing one; the main process validates it again. */
export function SkillEditor({ editing, onSave, onDone }: SkillEditorProps): React.JSX.Element {
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const finalName = editing ? editing.name : finishSkillName(name)
    const result = await onSave({ name: finalName, description, body })
    setSaving(false)
    if (result.ok) onDone()
    else setError(result.error.message)
  }

  return (
    <form
      aria-label={editing ? `Edit ${editing.name}` : 'New skill'}
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
    >
      <h3 className="text-[length:var(--text-title)] text-ink">
        {editing ? editing.name : 'New skill'}
      </h3>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Name</span>
        <input
          autoFocus={!editing}
          disabled={editing !== null}
          value={name}
          onChange={(event) => setName(toSkillName(event.target.value))}
          placeholder="code-review"
          spellCheck={false}
          className={`${FIELD} font-mono`}
        />
        <span className={HINT}>
          {editing
            ? 'The name is the folder name, so it stays as it is.'
            : 'Lowercase letters, digits and hyphens. It becomes the folder name.'}
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>When to use it</span>
        <textarea
          autoFocus={editing !== null}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Use when reviewing a pull request or a diff."
          className={`${FIELD} resize-none`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Instructions</span>
        <textarea
          rows={9}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={BODY_PLACEHOLDER}
          spellCheck={false}
          className={`${FIELD} resize-y font-mono text-[length:var(--text-meta)] leading-relaxed`}
        />
        <span className={HINT}>
          Markdown. Added to the system prompt of every member that has this skill.
        </span>
      </label>

      <EditorActions saving={saving} error={error} onCancel={onDone} />
    </form>
  )
}

interface EditorActionsProps {
  readonly saving: boolean
  readonly error: string | null
  readonly onCancel: () => void
}

function EditorActions({ saving, error, onCancel }: EditorActionsProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 pt-1">
      <p role="status" className="min-w-0 flex-1 text-[length:var(--text-micro)] text-danger">
        {error}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[length:var(--text-ui)] text-[var(--c-canvas)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save skill'}
      </button>
    </div>
  )
}
