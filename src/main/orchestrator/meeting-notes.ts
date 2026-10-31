import type { Company, CompanyStreamEvent, ProviderId } from '@shared/types'
import { getCompanySummary, listCompanyMessages, saveCompanySummary } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import { memberErrorMessage } from './member-error'
import { planCompaction, summaryPrompt, usableSummary } from './meeting-context'

interface RefreshOptions {
  readonly company: Company
  readonly conversationId: number
  readonly signal: AbortSignal
  readonly onEvent: (event: CompanyStreamEvent) => void
}

const NOTE_TAKER_PROMPT =
  'You take accurate, compact meeting notes. You never invent facts and never answer the meeting yourself.'

/**
 * Local servers (Ollama, LM Studio) cut an overlong prompt from the front without an error, so
 * their notes could quietly skip messages that would then never be sent again.
 */
const TRUNCATES_SILENTLY: ReadonlySet<ProviderId> = new Set(['ollama'])

/**
 * Folds the meeting's older messages into its saved notes, so every turn re-sends a short summary
 * instead of the whole transcript. The moderator writes them, chat-only, or the next member that
 * can when it runs locally; with no one able to, the meeting sends its transcript as before. A
 * failed fold keeps the last notes and the turn goes on; only a stop rethrows.
 */
export async function refreshMeetingNotes(options: RefreshOptions): Promise<void> {
  const { company, conversationId, signal, onEvent } = options
  const members = company.members ?? []
  const moderator = members.find((m) => m.id === company.moderatorMemberId) ?? members[0]
  const noteTaker = [moderator, ...members].find((m) => m && !TRUNCATES_SILENTLY.has(m.provider))
  const saved = getCompanySummary(conversationId)
  const chunks = planCompaction(listCompanyMessages(conversationId), saved?.coveredUntilId ?? 0)
  if (!noteTaker || chunks.length === 0) return

  onEvent({
    type: 'phase',
    conversationId,
    phase: 'compaction',
    description: 'Condensing the earlier discussion to save tokens…'
  })

  let notes = saved?.content ?? null
  for (const chunk of chunks) {
    if (signal.aborted) return

    let streamed = ''
    try {
      const result = await dispatchLLM(
        {
          provider: noteTaker.provider,
          modelId: noteTaker.modelId,
          systemPrompt: NOTE_TAKER_PROMPT,
          messages: [{ role: 'user', content: summaryPrompt(notes, chunk) }],
          temperature: 0.2,
          signal
        },
        { onContentDelta: (text) => (streamed += text) }
      )
      const next = usableSummary(result.text || streamed)
      // Moving the pointer hides these messages for good, so only real notes may move it
      if (!next) throw new Error('the notes came back empty')
      if (signal.aborted) return

      saveCompanySummary(conversationId, {
        content: next,
        coveredUntilId: chunk[chunk.length - 1].id
      })
      notes = next
    } catch (error) {
      if (signal.aborted) throw error
      console.error(
        `[meeting] could not condense conversation ${conversationId}, keeping the last notes:`,
        memberErrorMessage(noteTaker, error)
      )
      return
    }
  }
}
