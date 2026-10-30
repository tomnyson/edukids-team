import type { Company } from '@shared/types'

/** How the team takes turns, as the user sees it. */
export function modeName(company: Company): string {
  return company.defaultMode === 'pipeline' ? 'Task pipeline' : 'Roundtable'
}

/** "1 bot", "3 bots". */
export function botCount(company: Company): string {
  const count = company.members?.length ?? 0
  return `${count} ${count === 1 ? 'bot' : 'bots'}`
}
