import type { PromptSkill } from '../../shared/skills'
import { SKILL_DESCRIPTION_MAX } from './skill-format'

export interface PromptBudget {
  /** Characters of one skill's body before it is cut. */
  readonly perSkill: number
  /** Characters all skill blocks together may add to the prompt. */
  readonly total: number
}

export const DEFAULT_BUDGET: PromptBudget = { perSkill: 8_000, total: 24_000 }

/** Names come from front matter the user may not have written, so they are cut too. */
const NAME_MAX = 100
/** How many left-out skills are named before the rest are only counted. */
const LEFT_OUT_NAMED = 12

const HEADER = [
  '# Skills',
  '',
  'You have these skills. Follow a skill whenever the task matches its description.',
  'Paths in a skill are relative to its folder.'
].join('\n')

/** Any spelling of the closing tag a model might read as one: `</skill>`, `</ skill >`, `</SKILL>`. */
const CLOSER = /<\s*\/\s*skill\s*>/gi

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Text inside a block may not close its wrapper and let later text pose as outside the skill. */
function escapeClosers(text: string): string {
  return text.replace(CLOSER, '<\\/skill>')
}

/** The first `limit` UTF-16 units, one fewer when the cut would split a surrogate pair. */
function cut(text: string, limit: number): string {
  if (text.length <= limit) return text
  const code = text.charCodeAt(limit - 1)
  const end = code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit
  return text.slice(0, end)
}

function shorten(text: string, limit: number): string {
  return text.length <= limit ? text : `${cut(text, limit)}…`
}

function clipBody(body: string, limit: number): string {
  if (body.length <= limit) return body
  return `${cut(body, limit)}\n\n[Truncated: this skill is longer than the prompt allows.]`
}

const label = (name: string): string => escapeAttribute(shorten(name, NAME_MAX))

function renderSkill(skill: PromptSkill, perSkill: number): string {
  const open = `<skill name="${label(skill.name)}" folder="${escapeAttribute(skill.folder)}">`
  const description = shorten(skill.description, SKILL_DESCRIPTION_MAX)
  const body = clipBody(skill.body, perSkill)
  // Escaped once joined, so the description and body cannot each bring half of a closing tag
  const inside = escapeClosers(`Description: ${description}\n\n${body}`)
  return `${open}\n${inside}\n</skill>`
}

function leftOutLine(names: readonly string[]): readonly string[] {
  if (names.length === 0) return []
  const named = names.slice(0, LEFT_OUT_NAMED).map(label).join(', ')
  const more = names.length - LEFT_OUT_NAMED
  return [`Left out for length: ${named}${more > 0 ? ` and ${more} more` : ''}.`]
}

/**
 * The member's own prompt followed by its skills. Skills go in order until the total budget is
 * spent; the rest are named so the model knows they exist but were left out.
 */
export function composeMemberPrompt(
  base: string,
  skills: readonly PromptSkill[],
  budget: PromptBudget = DEFAULT_BUDGET
): string {
  if (skills.length === 0) return base

  const blocks = skills.map((skill) => ({
    name: skill.name,
    text: renderSkill(skill, budget.perSkill)
  }))
  const kept = blocks.reduce<{ used: number; texts: readonly string[]; left: readonly string[] }>(
    (acc, block) =>
      acc.used + block.text.length <= budget.total
        ? { ...acc, used: acc.used + block.text.length, texts: [...acc.texts, block.text] }
        : { ...acc, left: [...acc.left, block.name] },
    { used: 0, texts: [], left: [] }
  )

  return [base, HEADER, ...leftOutLine(kept.left), ...kept.texts].join('\n\n')
}
