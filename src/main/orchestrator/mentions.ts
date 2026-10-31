import type { CompanyMember } from '@shared/types'

type Mentionable = Pick<CompanyMember, 'name'>

/** What each addressed member is told, so it answers the user instead of running a meeting. */
export const DIRECT_REPLY_INSTRUCTION =
  'The user addressed you directly with an @mention. Answer them yourself, in your own voice. Only the members they mentioned reply this turn; nobody frames the discussion or sums it up.'

/** A letter, digit, `_` or `-` right after a name means the word goes on, so it is not that name. */
const WORD_CHAR = /[\p{L}\p{N}_-]/u

/**
 * The members the prompt addresses with `@name`, in prompt order and each once. The `@` must open
 * the prompt or follow whitespace, like the composer's member list, and where two names start at
 * the same `@` the longer one wins, so `@Dev Lead` never also counts as `@Dev`.
 */
export function mentionedMembers<T extends Mentionable>(
  prompt: string,
  members: readonly T[]
): T[] {
  const longestFirst = [...members].sort((a, b) => b.name.length - a.name.length)
  const hits = [...prompt.matchAll(/(?<=^|\s)@/g)].flatMap((match) => {
    const start = match.index + 1
    const member = longestFirst.find(
      ({ name }) =>
        name !== '' &&
        prompt.slice(start, start + name.length).toLowerCase() === name.toLowerCase() &&
        !WORD_CHAR.test(prompt.charAt(start + name.length))
    )
    return member ? [member] : []
  })
  return hits.filter((member, index) => hits.indexOf(member) === index)
}
