import type { CompanyMember } from '@shared/types'

/** Prefixes a failed turn's error with the member and its model, so the user knows which setting to fix. */
export function memberErrorMessage(
  member: Pick<CompanyMember, 'name' | 'provider' | 'modelId'>,
  error: unknown
): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${member.name} (${member.provider} · ${member.modelId}): ${message}`
}
