import { useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { MAX_SKILLS_PER_MEMBER, type SkillSummary } from '@shared/skills'
import { filterSkills, revertSkillRef, toggleSkillRef } from '@renderer/lib/skills'

interface SkillPickerProps {
  /** Null while the library is loading. */
  readonly skills: readonly SkillSummary[] | null
  readonly selected: readonly string[]
  /** Saves the new list; resolves to an error message, or null once saved. */
  readonly onChange: (refs: readonly string[]) => Promise<string | null>
  readonly onClose: () => void
}

/**
 * Checks skills on and off for one member. Each change saves at once; the list is kept here
 * so quick clicks build on each other instead of on a stale prop.
 */
export function SkillPicker({
  skills,
  selected,
  onChange,
  onClose
}: SkillPickerProps): React.JSX.Element {
  const [refs, setRefs] = useState(selected)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const toggle = async (ref: string): Promise<void> => {
    const next = toggleSkillRef(refs, ref, MAX_SKILLS_PER_MEMBER)
    if (next === refs) {
      setError(`A member can carry at most ${MAX_SKILLS_PER_MEMBER} skills.`)
      return
    }
    const wasOn = refs.includes(ref)
    setRefs(next)
    setError(null)
    const failure = await onChange(next)
    if (failure) {
      setError(failure)
      // Only this toggle is undone; `refs` here is stale if more clicks landed meanwhile
      setRefs((current) => revertSkillRef(current, ref, wasOn))
    }
  }

  const known = new Set((skills ?? []).map((skill) => skill.ref))
  const missing = skills ? refs.filter((ref) => !known.has(ref)) : []

  return (
    <div
      role="group"
      aria-label="Skills"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/80"
    >
      <label className="flex items-center gap-2 border-b border-zinc-800 px-2.5 py-1.5">
        <Search aria-hidden className="size-3 shrink-0 text-zinc-500" />
        <span className="sr-only">Search skills</span>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills"
          className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </label>

      <ul className="max-h-44 overflow-y-auto py-1">
        {missing.map((ref) => (
          <MissingOption key={ref} skillRef={ref} onRemove={() => void toggle(ref)} />
        ))}
        {skills === null ? (
          <li className="px-2.5 py-2 text-zinc-500">Loading skills…</li>
        ) : (
          <SkillOptions
            skills={filterSkills(skills, query)}
            refs={refs}
            empty={skills.length === 0 ? 'No skills yet.' : 'No match.'}
            onToggle={(ref) => void toggle(ref)}
          />
        )}
      </ul>

      <PickerFooter count={refs.length} error={error} onClose={onClose} />
    </div>
  )
}

interface SkillOptionsProps {
  readonly skills: readonly SkillSummary[]
  readonly refs: readonly string[]
  readonly empty: string
  readonly onToggle: (ref: string) => void
}

function SkillOptions({ skills, refs, empty, onToggle }: SkillOptionsProps): React.JSX.Element {
  if (skills.length === 0) return <li className="px-2.5 py-2 text-zinc-500">{empty}</li>
  const full = refs.length >= MAX_SKILLS_PER_MEMBER
  return (
    <>
      {skills.map((skill) => {
        const checked = refs.includes(skill.ref)
        // A broken skill can still be taken off, never put on
        const disabled = !checked && (full || skill.problem !== null)
        return (
          <li key={skill.ref}>
            <label
              title={skill.problem ?? skill.description}
              className={`flex items-start gap-2 px-2.5 py-1.5 ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-zinc-900'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(skill.ref)}
                className="mt-0.5 accent-cyan-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-zinc-100">{skill.name}</span>
                  <span className="shrink-0 rounded bg-zinc-800 px-1 text-[9px] text-zinc-400 uppercase">
                    {skill.source === 'user' ? 'Claude Code' : 'App'}
                  </span>
                </span>
                <span
                  className={`block truncate text-[10px] ${skill.problem ? 'text-amber-400' : 'text-zinc-500'}`}
                >
                  {skill.problem ?? skill.description}
                </span>
              </span>
            </label>
          </li>
        )
      })}
    </>
  )
}

interface MissingOptionProps {
  readonly skillRef: string
  readonly onRemove: () => void
}

/** An attached skill that is gone from the library; it can only be taken off. */
function MissingOption({ skillRef, onRemove }: MissingOptionProps): React.JSX.Element {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 px-2.5 py-1.5 hover:bg-zinc-900">
        <input type="checkbox" checked onChange={onRemove} className="mt-0.5 accent-cyan-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-red-400 line-through">{skillRef}</span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <AlertTriangle aria-hidden className="size-3 text-red-400" />
            No longer in the library. Uncheck to remove it.
          </span>
        </span>
      </label>
    </li>
  )
}

interface PickerFooterProps {
  readonly count: number
  readonly error: string | null
  readonly onClose: () => void
}

function PickerFooter({ count, error, onClose }: PickerFooterProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 px-2.5 py-1.5">
      <p
        role="status"
        className={`min-w-0 flex-1 truncate text-[10px] ${error ? 'text-red-400' : 'text-zinc-500'}`}
      >
        {error ??
          `${count}/${MAX_SKILLS_PER_MEMBER} attached · write new ones in Settings → Skills`}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
      >
        Done
      </button>
    </div>
  )
}
