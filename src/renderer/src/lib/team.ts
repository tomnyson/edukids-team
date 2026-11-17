import type { Company } from '@shared/types'

/** How the team takes turns, as the user sees it. */
export function modeName(company: Pick<Company, 'defaultMode'>): string {
  if (company.defaultMode === 'single') return 'Direct chat'
  return company.defaultMode === 'pipeline' ? 'Task pipeline' : 'Roundtable'
}

/** One model answers alone: no meeting, no mentions, and its model can be swapped in the chat. */
export const isDirectChat = (company: Pick<Company, 'defaultMode'> | null | undefined): boolean =>
  company?.defaultMode === 'single'

/** "1 bot", "3 bots". */
export function botCount(company: Company): string {
  const count = company.members?.length ?? 0
  return `${count} ${count === 1 ? 'bot' : 'bots'}`
}
