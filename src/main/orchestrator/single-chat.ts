import type { CompanyMember, CompanyMessage } from '@shared/types'
import type { CompanySummary } from '../db/companies'
import type { ChatMessage } from '../providers/types'
import { NOTES_LABEL } from './meeting-context'

export { directMember } from '@shared/direct-chat'

/**
 * What the model reads in a direct chat: a plain transcript. No speaker labels, which a lone
 * model would start imitating, and nothing after the user's newest prompt.
 */
export function buildDirectMessages(
  history: readonly Pick<CompanyMessage, 'id' | 'senderType' | 'content'>[],
  summary: CompanySummary | null
): ChatMessage[] {
  const coveredUntilId = summary?.coveredUntilId ?? 0
  const recent = history
    .filter((message) => message.id > coveredUntilId)
    .map((message): ChatMessage => ({
      role: message.senderType === 'user' ? 'user' : 'assistant',
      content: message.content
    }))
  return summary
    ? [{ role: 'user', content: `${NOTES_LABEL}\n${summary.content}` }, ...recent]
    : recent
}

/**
 * The member's own prompt plus the real folder. Only a CLI-backed model has tools there, so the
 * note asks for honesty rather than promising any.
 */
export function directSystemPrompt(
  member: Pick<CompanyMember, 'systemPrompt'>,
  folder: string
): string {
  return `${member.systemPrompt}\n\nWorking folder: ${folder}\nSay you wrote a file or ran a command only when you really did so with a tool.`
}
