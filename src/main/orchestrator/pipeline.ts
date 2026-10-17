import type { CompanyMember } from '@shared/types'
import { insertCompanyMessage, listCompanyMessages } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import type { ChatMessage } from '../providers/types'
import type { OrchestrationOptions } from './roundtable'

export async function runPipeline(options: OrchestrationOptions): Promise<void> {
  const { company, conversationId, userPrompt, signal, onEvent } = options
  const members = company.members ?? []

  if (members.length === 0) {
    throw new Error('This Company has no members configured.')
  }

  // 1. Record user's prompt
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
  onEvent({
    type: 'member-done',
    conversationId,
    memberId: null,
    message: userMsg
  })

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

    const history = listCompanyMessages(conversationId)
    const contextMessages: ChatMessage[] = history.map((h) => ({
      role: h.senderType === 'user' ? 'user' : 'assistant',
      content: h.memberName ? `[${h.memberName} - ${h.memberRole}]: ${h.content}` : h.content
    }))

    contextMessages.push({
      role: 'user',
      content: `[Pipeline Step: ${phase}]: ${instruction}`
    })

    let streamedReasoning = ''
    let streamedContent = ''

    const result = await dispatchLLM(
      {
        provider: member.provider,
        modelId: member.modelId,
        systemPrompt: `${member.systemPrompt}\n\nYou are executing a structured task pipeline. Produce production-grade, highly actionable deliverables.`,
        messages: contextMessages,
        temperature: member.temperature,
        funMode: company.funMode,
        signal
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
    )

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
