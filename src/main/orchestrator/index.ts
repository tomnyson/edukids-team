import { insertCompanyMessage } from '../db/companies'
import type { OrchestrationOptions } from './roundtable'
import { runRoundtable } from './roundtable'
import { runPipeline } from './pipeline'
import { mentionedMembers } from './mentions'
import { refreshMeetingNotes } from './meeting-notes'

export async function runCompanyOrchestration(options: OrchestrationOptions): Promise<void> {
  const { company, conversationId, userPrompt, onEvent } = options
  const members = company.members ?? []
  if (members.length === 0) {
    throw new Error('This Company has no members configured.')
  }

  // Saved before the notes are condensed, so a stop during that never loses what the user asked
  const userMsg = insertCompanyMessage({
    conversationId,
    senderType: 'user',
    memberId: null,
    content: userPrompt,
    reasoningContent: null,
    stepIndex: 0,
    phase: 'prompt',
    durationMs: null,
    tokensUsed: null
  })
  onEvent({ type: 'member-done', conversationId, memberId: null, message: userMsg })

  await refreshMeetingNotes(options)

  const mode = company.defaultMode ?? 'roundtable'
  // Decided once, so an @mention means the same thing in either mode
  const addressed = mentionedMembers(userPrompt, members)
  if (mode === 'pipeline') {
    return runPipeline(options, addressed)
  }
  return runRoundtable(options, addressed)
}

export { runRoundtable, runPipeline }
export type { OrchestrationOptions }
