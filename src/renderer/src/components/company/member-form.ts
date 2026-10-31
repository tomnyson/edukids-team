import type { AddMemberInput, ProviderId } from '@shared/types'

export interface MemberDraft {
  readonly name: string
  readonly role: string
  readonly provider: ProviderId
  readonly modelId: string
  readonly systemPrompt: string
  readonly avatarColor: string
}

const DEFAULT_ROLE = 'Member'

/** Only the name is required; a blank role used to make Add silently do nothing. */
export function toMemberInput(companyId: number, draft: MemberDraft): AddMemberInput | null {
  const name = draft.name.trim()
  if (!name) return null
  const role = draft.role.trim() || DEFAULT_ROLE
  return {
    companyId,
    name,
    role,
    provider: draft.provider,
    modelId: draft.modelId.trim() || 'default',
    systemPrompt: draft.systemPrompt.trim() || `You are ${name}, acting as ${role}.`,
    avatarColor: draft.avatarColor
  }
}
