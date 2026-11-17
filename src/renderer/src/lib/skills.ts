import type { SkillSummary } from '@shared/skills'

/** Skills whose name, folder or description contain `query`, ignoring case. */
export function filterSkills(
  skills: readonly SkillSummary[],
  query: string
): readonly SkillSummary[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return skills
  return skills.filter((skill) =>
    [skill.name, skill.dir, skill.description].some((text) => text.toLowerCase().includes(needle))
  )
}

/** Adds `ref` at the end, or removes it. A list already at `max` refuses one more. */
export function toggleSkillRef(
  refs: readonly string[],
  ref: string,
  max: number
): readonly string[] {
  if (refs.includes(ref)) return refs.filter((entry) => entry !== ref)
  return refs.length >= max ? refs : [...refs, ref]
}

/**
 * Undoes one toggle whose save failed, on top of whatever was clicked since. `wasOn` is
 * whether `ref` was attached before that toggle. No cap: a ref the save failed to remove is
 * still attached on disk.
 */
export function revertSkillRef(
  refs: readonly string[],
  ref: string,
  wasOn: boolean
): readonly string[] {
  if (refs.includes(ref) === wasOn) return refs
  return wasOn ? [...refs, ref] : refs.filter((entry) => entry !== ref)
}

export type ChipStatus = 'ok' | 'missing' | 'broken'

export interface SkillChip {
  readonly ref: string
  readonly label: string
  readonly status: ChipStatus
  /** Why a member skips this skill, or null when it is used. */
  readonly note: string | null
}

const MISSING_NOTE = 'This skill is no longer in the library. Members skip it.'

function folderOf(ref: string): string {
  return ref.slice(ref.indexOf(':') + 1)
}

/**
 * One chip per attached skill. `skills` is null until the list loads; nothing is flagged
 * then, so a slow load is never shown as a missing skill.
 */
export function skillChips(
  refs: readonly string[],
  skills: readonly SkillSummary[] | null
): readonly SkillChip[] {
  return refs.map((ref) => {
    const skill = skills?.find((entry) => entry.ref === ref)
    if (skill) {
      return skill.problem
        ? { ref, label: skill.name, status: 'broken', note: skill.problem }
        : { ref, label: skill.name, status: 'ok', note: null }
    }
    const status: ChipStatus = skills === null ? 'ok' : 'missing'
    return { ref, label: folderOf(ref), status, note: status === 'missing' ? MISSING_NOTE : null }
  })
}

const NAME_MAX = 64

/**
 * Shapes typed text into a folder name as the user types: lowercase ASCII, digits and single
 * hyphens. A trailing hyphen is kept so the next word can follow it.
 */
export function toSkillName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trimStart()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, NAME_MAX)
}

/** The name to save: as typed, without a dangling hyphen. */
export function finishSkillName(text: string): string {
  return toSkillName(text).replace(/-+$/, '')
}
