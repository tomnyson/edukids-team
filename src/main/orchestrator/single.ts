import { getCompanySummary, listCompanyMessages } from '../db/companies'
import type { OrchestrationOptions } from './roundtable'
import { directMember } from '@shared/direct-chat'
import { streamMemberReply } from './reply'
import { buildDirectMessages, directSystemPrompt } from './single-chat'

/** A direct chat: one model answers the user, with no framing, debate or synthesis around it. */
export async function runSingle(options: OrchestrationOptions): Promise<void> {
  // The user's prompt is already saved by runCompanyOrchestration, which also checks for members
  const { company, conversationId, folder, signal, onEvent } = options
  const member = directMember(company)
  if (!member) throw new Error('This chat has no model configured.')
  if (signal.aborted) return

  onEvent({ type: 'started', conversationId, memberId: member.id, memberName: member.name })
  onEvent({
    type: 'phase',
    conversationId,
    phase: 'reply',
    description: `${member.name} is replying...`
  })

  await streamMemberReply(options, member, {
    systemPrompt: directSystemPrompt(member, folder),
    messages: buildDirectMessages(
      listCompanyMessages(conversationId),
      getCompanySummary(conversationId)
    ),
    // The only model in the chat, so it is the one that may work in the folder
    executor: true
  })
}
