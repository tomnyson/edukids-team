import type { Company, CompanyMember } from './types'

/** The one member that answers a direct chat: the chosen lead, else the first; null with none. */
export function directMember(
  company: Pick<Company, 'members' | 'moderatorMemberId'>
): CompanyMember | null {
  const members = company.members ?? []
  return members.find((member) => member.id === company.moderatorMemberId) ?? members[0] ?? null
}
