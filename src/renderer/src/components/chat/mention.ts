import type { CompanyMember } from '@shared/types'

export interface MentionQuery {
  /** Index of the `@` that opened the mention. */
  readonly start: number
  /** What was typed after the `@`, up to the caret. */
  readonly text: string
}

export interface ComposerEdit {
  readonly value: string
  readonly caret: number
}

type Mentionable = Pick<CompanyMember, 'name' | 'role'>

/**
 * The `@word` the caret ends. The `@` must open the prompt or follow whitespace, so an email
 * address never opens the member list.
 */
export function mentionAt(value: string, caret: number): MentionQuery | null {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret))
  if (!match) return null
  const text = match[1]
  return { start: caret - text.length - 1, text }
}

/** Members whose name starts with the query come first, then names or roles that contain it. */
export function matchMembers<T extends Mentionable>(members: readonly T[], text: string): T[] {
  const needle = text.toLowerCase()
  const leading = members.filter((member) => member.name.toLowerCase().startsWith(needle))
  const others = members.filter(
    (member) =>
      !leading.includes(member) &&
      (member.name.toLowerCase().includes(needle) || member.role.toLowerCase().includes(needle))
  )
  return [...leading, ...others]
}

/** Replaces the typed `@query` with `@name` and one space, leaving the caret after that space. */
export function insertMention(
  value: string,
  query: MentionQuery,
  caret: number,
  name: string
): ComposerEdit {
  const rest = value.slice(caret)
  const tail = /^\s/.test(rest) ? rest : ` ${rest}`
  return {
    value: `${value.slice(0, query.start)}@${name}${tail}`,
    caret: query.start + name.length + 2
  }
}

/** Types an `@` at the caret for the @ button, spaced off a preceding word so it opens a mention. */
export function startMention(value: string, caret: number): ComposerEdit {
  const before = value.slice(0, caret)
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const opened = `${before}${lead}@`
  return { value: `${opened}${value.slice(caret)}`, caret: opened.length }
}
