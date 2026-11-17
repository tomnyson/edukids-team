import type { Citation } from '@shared/citations'
import type { CompanyMember } from '@shared/types'
import { insertCompanyMessage } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import type { ChatMessage } from '../providers/types'
import { memberErrorMessage } from './member-error'
import type { OrchestrationOptions } from './roundtable'

export interface ReplyRequest {
  readonly systemPrompt: string
  readonly messages: readonly ChatMessage[]
  /** Whether a CLI-backed model may use its tools in the project folder for this reply. */
  readonly executor: boolean
  readonly citations?: readonly Citation[]
  /** Tokens spent on steps before the reply, counted into the stored turn. */
  readonly tokensBefore?: number
}

/** The one model's reply: streamed to the renderer as it arrives, stored when it ends. */
export async function streamMemberReply(
  options: OrchestrationOptions,
  member: CompanyMember,
  request: ReplyRequest
): Promise<void> {
  const { company, conversationId, folder, signal, onEvent } = options
  let streamedReasoning = ''
  let streamedContent = ''

  const result = await dispatchLLM(
    {
      provider: member.provider,
      modelId: member.modelId,
      systemPrompt: request.systemPrompt,
      messages: request.messages,
      temperature: member.temperature,
      funMode: company.funMode,
      signal,
      cwd: folder,
      executor: request.executor
    },
    {
      onReasoningDelta: (text) => {
        streamedReasoning += text
        onEvent({ type: 'reasoning', conversationId, memberId: member.id, text })
      },
      onContentDelta: (text) => {
        streamedContent += text
        onEvent({ type: 'delta', conversationId, memberId: member.id, text })
      }
    }
  ).catch((error: unknown) => {
    // A user stop is not a model failure; keep the original cancel error
    if (signal.aborted) throw error
    throw new Error(memberErrorMessage(member, error), { cause: error })
  })

  const tokens = (result.tokensUsed ?? 0) + (request.tokensBefore ?? 0)
  const message = insertCompanyMessage({
    conversationId,
    senderType: 'member',
    memberId: member.id,
    content: result.text || streamedContent,
    reasoningContent: result.reasoningText || streamedReasoning || null,
    stepIndex: 1,
    phase: 'reply',
    durationMs: result.durationMs,
    tokensUsed: tokens > 0 ? tokens : null,
    citations: request.citations ?? []
  })

  onEvent({ type: 'member-done', conversationId, memberId: member.id, message })
  onEvent({ type: 'finished', conversationId })
}
