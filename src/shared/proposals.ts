import type { ProviderId } from './types'

/**
 * A new team member the CEO asked for. The CEO only proposes: nothing joins the team until the
 * user approves it, because the text comes from a model that reads the project's files.
 */

/** Longest each field may be; a system prompt past this is refused, not clipped. */
export const PROPOSAL_LIMITS = {
  name: 40,
  role: 80,
  systemPrompt: 4000,
  modelId: 200,
  reason: 500
} as const

/** A team this size gets no more proposals: every member is one more model call per prompt. */
export const MAX_MEMBERS = 8

export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/** The member as proposed, and as the user may edit it before approving. */
export interface ProposalDraft {
  readonly name: string
  readonly role: string
  readonly systemPrompt: string
  readonly provider: ProviderId
  readonly modelId: string
  readonly reason: string
}

export interface MemberProposal extends ProposalDraft {
  readonly id: number
  readonly conversationId: number
  /** The CEO's message the proposal came with. */
  readonly messageId: number
  readonly companyId: number
  readonly status: ProposalStatus
  /** The member an approved proposal became; null once that member is removed. */
  readonly createdMemberId: number | null
  readonly createdAt: string
}

export interface ProposalContext {
  /** Names already on the team; a proposal may not reuse one, or `@name` would be ambiguous. */
  readonly memberNames: readonly string[]
  /** Providers the team already runs on. Any other is replaced by the fallback. */
  readonly providers: readonly ProviderId[]
  /** The CEO's own model, used when the proposal names none that is usable. */
  readonly fallback: { readonly provider: ProviderId; readonly modelId: string }
}

/** One line of text within `max`, or null. */
function line(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text !== '' && text.length <= max && !/[\r\n]/.test(text) ? text : null
}

function modelOf(
  record: Record<string, unknown>,
  context: ProposalContext
): ProposalContext['fallback'] {
  const provider = context.providers.find((id) => id === record.provider)
  const modelId = line(record.modelId, PROPOSAL_LIMITS.modelId)
  return provider && modelId ? { provider, modelId } : context.fallback
}

/**
 * Rebuilds a proposal from untrusted input (a model's JSON, or the renderer's edited copy).
 * Null when it cannot become a member: a missing field, an over-long one, a name already taken.
 */
export function toProposalDraft(raw: unknown, context: ProposalContext): ProposalDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const rawName = typeof record.name === 'string' ? record.name.trim().replace(/^@+/, '') : null
  const name = line(rawName, PROPOSAL_LIMITS.name)
  const role = line(record.role, PROPOSAL_LIMITS.role)
  const systemPrompt = typeof record.systemPrompt === 'string' ? record.systemPrompt.trim() : ''
  if (!name || !role) return null
  if (systemPrompt === '' || systemPrompt.length > PROPOSAL_LIMITS.systemPrompt) return null

  const taken = context.memberNames.some((other) => other.toLowerCase() === name.toLowerCase())
  if (taken) return null

  const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
  return {
    name,
    role,
    systemPrompt,
    ...modelOf(record, context),
    reason: reason.slice(0, PROPOSAL_LIMITS.reason)
  }
}
