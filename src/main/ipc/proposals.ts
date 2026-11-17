import { ipcMain } from 'electron'
import { PROPOSAL_CHANNELS } from '@shared/ipc'
import { MAX_MEMBERS, toProposalDraft, type MemberProposal } from '@shared/proposals'
import { isConversationId } from '@shared/queue'
import type { Result } from '@shared/types'
import { addCompanyMember, findCompany } from '../db/companies'
import { getDb } from '../db/connection'
import { findProposal, listProposals, resolveProposal } from '../db/member-proposals'
import { fail, guard, ok } from './result'

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const invalid = (message: string): Result<never> => fail({ code: 'INVALID_INPUT', message })
const gone = (message: string): Result<never> => fail({ code: 'NOT_FOUND', message })

const ALREADY_SETTLED = 'That proposal was already approved or declined.'

/**
 * Turns a pending proposal into a team member. `rawDraft` is the renderer's edited copy, so it
 * is rebuilt and checked against the team as it is now, not as it was when the CEO proposed.
 */
function approveProposal(id: number, rawDraft: unknown): Result<MemberProposal> {
  const proposal = findProposal(getDb(), id)
  if (!proposal) return gone('That proposal no longer exists.')
  if (proposal.status !== 'pending') return invalid(ALREADY_SETTLED)

  const company = findCompany(proposal.companyId)
  if (!company) return gone('That team no longer exists.')
  const members = company.members ?? []
  if (members.length >= MAX_MEMBERS) {
    return invalid(`A team can have at most ${MAX_MEMBERS} members. Remove one first.`)
  }

  // The model stays the one that was proposed and checked; only the wording is the user's to edit
  const draft = toProposalDraft(
    {
      ...(typeof rawDraft === 'object' ? rawDraft : null),
      provider: proposal.provider,
      modelId: proposal.modelId
    },
    {
      memberNames: members.map((member) => member.name),
      providers: [proposal.provider],
      fallback: { provider: proposal.provider, modelId: proposal.modelId }
    }
  )
  if (!draft) {
    return invalid(
      'That member cannot be added: it needs a name nobody on the team has, a role and instructions, each within its length limit.'
    )
  }

  const settled = getDb().transaction((): MemberProposal | null => {
    const member = addCompanyMember({
      companyId: company.id,
      name: draft.name,
      role: draft.role,
      provider: draft.provider,
      modelId: draft.modelId,
      systemPrompt: draft.systemPrompt
    })
    const resolved = resolveProposal(getDb(), id, 'approved', member.id)
    // Settled by another click in the meantime: undo the member rather than keep two
    if (!resolved) throw new Error(ALREADY_SETTLED)
    return resolved
  })()
  return settled ? ok(settled) : invalid(ALREADY_SETTLED)
}

export function registerProposalIpcHandlers(): void {
  ipcMain.handle(
    PROPOSAL_CHANNELS.list,
    guard('proposals', (_event, conversationId: unknown) =>
      isConversationId(conversationId)
        ? ok(listProposals(getDb(), conversationId))
        : invalid('That meeting is not valid.')
    )
  )

  ipcMain.handle(
    PROPOSAL_CHANNELS.approve,
    guard('proposals', (_event, id: unknown, draft: unknown) =>
      isId(id) ? approveProposal(id, draft) : invalid('That proposal is not valid.')
    )
  )

  ipcMain.handle(
    PROPOSAL_CHANNELS.reject,
    guard('proposals', (_event, id: unknown) => {
      if (!isId(id)) return invalid('That proposal is not valid.')
      const resolved = resolveProposal(getDb(), id, 'rejected', null)
      return resolved ? ok(resolved) : invalid(ALREADY_SETTLED)
    })
  )
}
