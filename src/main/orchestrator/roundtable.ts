import type { Company, CompanyMember, CompanyStreamEvent } from '@shared/types'
import { getCompanySummary, insertCompanyMessage, listCompanyMessages } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import type { ChatMessage } from '../providers/types'
import { memberErrorMessage } from './member-error'
import { buildContextMessages } from './meeting-context'
import { meetingFolderNote } from './meeting-folder'
import { DIRECT_REPLY_INSTRUCTION } from './mentions'

export interface OrchestrationOptions {
  readonly company: Company
  readonly conversationId: number
  readonly userPrompt: string
  /** The project folder the code goes into; resolved from the DB, never from the renderer. */
  readonly folder: string
  readonly signal: AbortSignal
  readonly onEvent: (event: CompanyStreamEvent) => void
}

export async function runRoundtable(
  options: OrchestrationOptions,
  addressed: readonly CompanyMember[] = []
): Promise<void> {
  // The user's prompt is already saved by runCompanyOrchestration, which also checks for members
  const { company, conversationId, folder, signal, onEvent } = options
  const members = company.members ?? []

  const moderator = members.find((m) => m.id === company.moderatorMemberId) ?? members[0]
  let currentStep = 1

  // Helper to execute a single member turn
  async function executeTurn(
    member: CompanyMember,
    phase: string,
    instruction: string
  ): Promise<void> {
    if (signal.aborted) return

    onEvent({
      type: 'started',
      conversationId,
      memberId: member.id,
      memberName: `${member.name} (${member.role})`
    })

    onEvent({
      type: 'phase',
      conversationId,
      phase,
      description: `${member.name} is speaking as ${member.role}...`
    })

    const contextMessages: ChatMessage[] = [
      ...buildContextMessages(
        listCompanyMessages(conversationId),
        getCompanySummary(conversationId)
      ),
      { role: 'user', content: `[Instruction]: ${instruction}` }
    ]

    let streamedReasoning = ''
    let streamedContent = ''
    // One executor, so two members never edit the same files
    const isExecutor = member.id === moderator?.id

    const result = await dispatchLLM(
      {
        provider: member.provider,
        modelId: member.modelId,
        systemPrompt: `${member.systemPrompt}\n\nYou are participating in a multi-model executive roundtable meeting. State your arguments concisely and sharply.\n\n${meetingFolderNote(folder, moderator?.name ?? member.name, isExecutor)}`,
        messages: contextMessages,
        temperature: member.temperature,
        funMode: company.funMode,
        signal,
        cwd: folder,
        executor: isExecutor
      },
      {
        onReasoningDelta: (chunk) => {
          streamedReasoning += chunk
          onEvent({
            type: 'reasoning',
            conversationId,
            memberId: member.id,
            text: chunk
          })
        },
        onContentDelta: (chunk) => {
          streamedContent += chunk
          onEvent({
            type: 'delta',
            conversationId,
            memberId: member.id,
            text: chunk
          })
        }
      }
    ).catch((error: unknown) => {
      // A user stop is not a member failure; keep the original cancel error
      if (signal.aborted) throw error
      throw new Error(memberErrorMessage(member, error), { cause: error })
    })

    const savedMsg = insertCompanyMessage({
      conversationId,
      senderType:
        member.id === moderator?.id && (phase === 'framing' || phase === 'synthesis')
          ? 'moderator'
          : 'member',
      memberId: member.id,
      content: result.text || streamedContent,
      reasoningContent: result.reasoningText || streamedReasoning || null,
      stepIndex: currentStep++,
      phase,
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed ?? null
    })

    onEvent({
      type: 'member-done',
      conversationId,
      memberId: member.id,
      message: savedMsg
    })
  }

  // An @mention is a direct question: only the members it names reply, with no meeting around it
  if (addressed.length > 0) {
    for (const member of addressed) {
      if (signal.aborted) break
      await executeTurn(member, 'reply', DIRECT_REPLY_INSTRUCTION)
    }
    onEvent({ type: 'finished', conversationId })
    return
  }

  // 2. Framing Phase by Moderator
  if (moderator && members.length > 1) {
    await executeTurn(
      moderator,
      'framing',
      `As the meeting Chair/Moderator, frame the discussion based on the user's prompt. Define the core objective, outline key trade-offs to evaluate, and invite specific viewpoints from the team.`
    )
  }

  // 3. Debate Phase (Remaining members contribute)
  for (const member of members) {
    if (signal.aborted) break
    if (member.id === moderator?.id && members.length > 1) continue

    await executeTurn(
      member,
      'debate',
      `Present your specialized analysis and critique on the topic and on previous team members' points. Highlight specific technical decisions, challenges, or alternative paradigms.`
    )
  }

  // 4. Synthesis Phase by Moderator
  if (moderator && !signal.aborted) {
    await executeTurn(
      moderator,
      'synthesis',
      `As the meeting Chair/Moderator, summarize the team debate into an executive decision. List points of consensus, resolved trade-offs, and concrete next actions.`
    )
  }

  onEvent({ type: 'finished', conversationId })
}
