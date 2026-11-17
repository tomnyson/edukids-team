import {
  MAX_MEMBERS,
  toProposalDraft,
  type MemberProposal,
  type ProposalDraft
} from '@shared/proposals'
import type { Company, CompanyMember, CompanyMessage } from '@shared/types'
import { getDb } from '../db/connection'
import { hasPendingProposal, insertProposal, rejectedProposalNames } from '../db/member-proposals'
import { extractProposal, proposalInstruction } from './proposal'

export interface CapturedReply {
  /** The reply as it is saved and shown, with any proposal block cut out. */
  readonly content: string
  readonly draft: ProposalDraft | null
}

export interface ProposalStep {
  /** Added to the CEO's instruction for this one turn. */
  readonly instruction: string
  readonly capture: (reply: string) => CapturedReply
}

/**
 * Lets the CEO propose a new member on this turn. Null when it may not: the team is full, or a
 * proposal in this meeting is still waiting for the user.
 */
export function openProposalStep(
  company: Company,
  conversationId: number,
  ceo: CompanyMember
): ProposalStep | null {
  const members = company.members ?? []
  if (members.length >= MAX_MEMBERS) return null
  if (hasPendingProposal(getDb(), conversationId)) return null

  const providers = [...new Set(members.map((member) => member.provider))]
  const context = {
    memberNames: members.map((member) => member.name),
    providers,
    fallback: { provider: ceo.provider, modelId: ceo.modelId }
  }

  return {
    instruction: proposalInstruction({
      team: members,
      providers,
      rejectedNames: rejectedProposalNames(getDb(), conversationId)
    }),
    capture: (reply) => {
      const { content, raw } = extractProposal(reply)
      return { content, draft: raw === null ? null : toProposalDraft(raw, context) }
    }
  }
}

/** Stores a captured proposal against the CEO message it came with. */
export function saveProposal(
  draft: ProposalDraft,
  message: CompanyMessage,
  companyId: number
): MemberProposal {
  return insertProposal(getDb(), {
    conversationId: message.conversationId,
    messageId: message.id,
    companyId,
    draft
  })
}
