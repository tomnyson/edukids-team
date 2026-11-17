import type Database from 'better-sqlite3'
import type { MemberProposal, ProposalDraft, ProposalStatus } from '@shared/proposals'
import type { ProviderId } from '@shared/types'

/**
 * New members the CEO proposed, and what the user decided. Takes the database as a parameter so
 * tests can run it against an in-memory one; callers in the app pass `getDb()`.
 */

interface ProposalRow {
  id: number
  conversation_id: number
  message_id: number
  company_id: number
  name: string
  role: string
  system_prompt: string
  provider: string
  model_id: string
  reason: string
  status: string
  created_member_id: number | null
  created_at: string
}

const toProposal = (row: ProposalRow): MemberProposal => ({
  id: row.id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  companyId: row.company_id,
  name: row.name,
  role: row.role,
  systemPrompt: row.system_prompt,
  provider: row.provider as ProviderId,
  modelId: row.model_id,
  reason: row.reason,
  status: row.status as ProposalStatus,
  createdMemberId: row.created_member_id,
  createdAt: row.created_at
})

export interface NewProposal {
  readonly conversationId: number
  readonly messageId: number
  readonly companyId: number
  readonly draft: ProposalDraft
}

export function findProposal(db: Database.Database, id: number): MemberProposal | null {
  const row = db.prepare('SELECT * FROM member_proposals WHERE id = ?').get(id) as
    ProposalRow | undefined
  return row ? toProposal(row) : null
}

export function insertProposal(db: Database.Database, input: NewProposal): MemberProposal {
  const { draft } = input
  const result = db
    .prepare(
      `INSERT INTO member_proposals (
        conversation_id, message_id, company_id, name, role, system_prompt, provider, model_id, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.conversationId,
      input.messageId,
      input.companyId,
      draft.name,
      draft.role,
      draft.systemPrompt,
      draft.provider,
      draft.modelId,
      draft.reason
    )
  const saved = findProposal(db, Number(result.lastInsertRowid))
  if (!saved) throw new Error('The proposal could not be saved.')
  return saved
}

export function listProposals(
  db: Database.Database,
  conversationId: number
): readonly MemberProposal[] {
  const rows = db
    .prepare('SELECT * FROM member_proposals WHERE conversation_id = ? ORDER BY id')
    .all(conversationId) as ProposalRow[]
  return rows.map(toProposal)
}

/** While one waits for the user, the CEO is not asked for another. */
export function hasPendingProposal(db: Database.Database, conversationId: number): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM member_proposals WHERE conversation_id = ? AND status = 'pending' LIMIT 1"
    )
    .get(conversationId)
  return row !== undefined
}

export function rejectedProposalNames(
  db: Database.Database,
  conversationId: number
): readonly string[] {
  const rows = db
    .prepare(
      "SELECT DISTINCT name FROM member_proposals WHERE conversation_id = ? AND status = 'rejected' ORDER BY id"
    )
    .all(conversationId) as { name: string }[]
  return rows.map((row) => row.name)
}

/**
 * Settles a pending proposal. Null when it does not exist or was already settled, so two
 * clicks on Approve never make two members.
 */
export function resolveProposal(
  db: Database.Database,
  id: number,
  status: Exclude<ProposalStatus, 'pending'>,
  createdMemberId: number | null
): MemberProposal | null {
  const result = db
    .prepare(
      "UPDATE member_proposals SET status = ?, created_member_id = ? WHERE id = ? AND status = 'pending'"
    )
    .run(status, createdMemberId, id)
  return result.changes === 1 ? findProposal(db, id) : null
}
