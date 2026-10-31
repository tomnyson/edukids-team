import type { CompanyMember } from '@shared/types'
import { getCompanySummary, insertCompanyMessage, listCompanyMessages } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import type { ChatMessage } from '../providers/types'
import type { OrchestrationOptions } from './roundtable'
import { memberErrorMessage } from './member-error'
import { buildContextMessages } from './meeting-context'
import { meetingFolderNote } from './meeting-folder'
import { DIRECT_REPLY_INSTRUCTION } from './mentions'

export async function runPipeline(
  options: OrchestrationOptions,
  addressed: readonly CompanyMember[] = []
): Promise<void> {
  // The user's prompt is already saved by runCompanyOrchestration, which also checks for members
  const { company, conversationId, folder, signal, onEvent } = options
  const members = company.members ?? []

  const leader = members[0]
  let currentStep = 1

  async function executeStep(
    member: CompanyMember,
    phase: string,
    instruction: string
  ): Promise<string> {
    if (signal.aborted) return ''

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
      description: `${member.name} is working on ${phase}...`
    })

    const contextMessages: ChatMessage[] = [
      ...buildContextMessages(
        listCompanyMessages(conversationId),
        getCompanySummary(conversationId)
      ),
      { role: 'user', content: `[Pipeline Step: ${phase}]: ${instruction}` }
    ]

    let streamedReasoning = ''
    let streamedContent = ''
    // The leader is the one executor, so two members never edit the same files
    const isExecutor = member.id === leader.id

    const result = await dispatchLLM(
      {
        provider: member.provider,
        modelId: member.modelId,
        systemPrompt: `${member.systemPrompt}\n\nYou are executing a structured task pipeline. Produce production-grade, highly actionable deliverables.\n\n${meetingFolderNote(folder, leader.name, isExecutor)}`,
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

    const finalContent = result.text || streamedContent

    const savedMsg = insertCompanyMessage({
      conversationId,
      senderType: 'member',
      memberId: member.id,
      content: finalContent,
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

    return finalContent
  }

  // An @mention is a direct question: only the members it names reply, with no pipeline around it
  if (addressed.length > 0) {
    for (const member of addressed) {
      if (signal.aborted) break
      await executeStep(member, 'reply', DIRECT_REPLY_INSTRUCTION)
    }
    onEvent({ type: 'finished', conversationId })
    return
  }

  // Phase 1: Planning / Task Breakdown by Leader
  await executeStep(
    leader,
    'planning',
    `Analyze the user's objective. Break it down into discrete steps and assign clear responsibilities to the specialist roles in this company: ${members.map((m) => `${m.name} (${m.role})`).join(', ')}.`
  )

  // Phase 2: Execution by Specialist Members
  for (let i = 1; i < members.length; i++) {
    if (signal.aborted) break
    const member = members[i]
    await executeStep(
      member,
      'execution',
      `Execute your assigned specialty task based on the plan above. Provide the concrete implementation, specification, or draft.`
    )
  }

  // Phase 3: Final Delivery Package by Leader
  if (!signal.aborted) {
    await executeStep(
      leader,
      'delivery',
      `Consolidate all deliverables into a cohesive, verified final response for the user.`
    )
  }

  onEvent({ type: 'finished', conversationId })
}
