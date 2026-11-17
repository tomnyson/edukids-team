import { insertCompanyMessage } from '../db/companies'
import type { OrchestrationOptions } from './roundtable'
import { runRoundtable } from './roundtable'
import { runPipeline } from './pipeline'
import { runSingle } from './single'
import { runSearched } from './searched'
import { mentionedMembers } from './mentions'
import { refreshMeetingNotes } from './meeting-notes'
import { skillRoots } from '../skills/library'
import { withSkillPrompts } from '../skills/member-prompts'

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

  // Skills are read once per run and folded into each member's system prompt
  const prepared = await withSkillPrompts(members, skillRoots())
  const run: OrchestrationOptions = { ...options, company: { ...company, members: prepared } }

  const mode = company.defaultMode ?? 'roundtable'
  // One model, so there is nobody to address: an `@name` is just text
  if (mode === 'single') {
    const search = options.searchMode ?? 'off'
    return search === 'off' ? runSingle(run) : runSearched(run, search)
  }
  // Decided once, so an @mention means the same thing in either mode
  const addressed = mentionedMembers(userPrompt, prepared)
  if (mode === 'pipeline') {
    return runPipeline(run, addressed)
  }
  return runRoundtable(run, addressed)
}

export { runRoundtable, runPipeline }
export type { OrchestrationOptions }
