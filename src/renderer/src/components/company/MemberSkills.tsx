import { useState } from 'react'
import { AlertTriangle, BookOpen } from 'lucide-react'
import type { SkillSummary } from '@shared/skills'
import { skillChips, type ChipStatus } from '@renderer/lib/skills'
import { SkillPicker } from './SkillPicker'

const CHIP_STYLE: Readonly<Record<ChipStatus, string>> = {
  ok: 'border-zinc-700 text-zinc-300',
  broken: 'border-amber-500/40 text-amber-400',
  missing: 'border-red-500/40 text-red-400 line-through'
}

interface MemberSkillsProps {
  readonly skillRefs: readonly string[]
  /** Null while the library is loading. */
  readonly skills: readonly SkillSummary[] | null
  /** Saves the member's new list; resolves to an error message, or null once saved. */
  readonly onChange: (refs: readonly string[]) => Promise<string | null>
}

/** The skills a member carries, as chips, with the picker to change them. */
export function MemberSkills({
  skillRefs,
  skills,
  onChange
}: MemberSkillsProps): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const chips = skillChips(skillRefs, skills)

  return (
    <div className="px-2.5 pb-2.5 pl-12">
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((chip) => (
          <span
            key={chip.ref}
            title={chip.note ?? chip.ref}
            className={`flex items-center gap-1 rounded border px-1.5 py-px text-[10px] ${CHIP_STYLE[chip.status]}`}
          >
            {chip.status === 'ok' ? null : <AlertTriangle aria-hidden className="size-2.5" />}
            {chip.label}
          </span>
        ))}
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          className="flex items-center gap-1 rounded px-1 py-px text-[10px] text-zinc-500 hover:text-cyan-400"
        >
          <BookOpen aria-hidden className="size-3" />
          {chips.length > 0 ? 'Skills' : 'Add skills'}
        </button>
      </div>
      {picking ? (
        <SkillPicker
          skills={skills}
          selected={skillRefs}
          onChange={onChange}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  )
}
