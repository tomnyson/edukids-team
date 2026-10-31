import type {
  AddMemberInput,
  Company,
  CompanyMember,
  CompanyMessage,
  CreateCompanyInput,
  ExecutionMode,
  ProviderId,
  SenderType,
  UpdateCompanyInput,
  UpdateMemberInput
} from '@shared/types'
import { getDb } from './connection'

interface CompanyRow {
  id: number
  name: string
  description: string | null
  avatar_icon: string
  default_mode: string
  fun_mode: number
  moderator_member_id: number | null
  created_at: string
  updated_at: string
}

interface MemberRow {
  id: number
  company_id: number
  name: string
  role: string
  provider: string
  model_id: string
  system_prompt: string
  temperature: number
  order_index: number
  avatar_color: string
  created_at: string
}

interface MessageRow {
  id: number
  conversation_id: number
  sender_type: string
  member_id: number | null
  member_name: string | null
  member_role: string | null
  member_color: string | null
  content: string
  reasoning_content: string | null
  step_index: number
  phase: string | null
  duration_ms: number | null
  tokens_used: number | null
  created_at: string
}

const toCompanyMember = (row: MemberRow): CompanyMember => ({
  id: row.id,
  companyId: row.company_id,
  name: row.name,
  role: row.role,
  provider: row.provider as ProviderId,
  modelId: row.model_id,
  systemPrompt: row.system_prompt,
  temperature: row.temperature,
  orderIndex: row.order_index,
  avatarColor: row.avatar_color,
  createdAt: row.created_at
})

const toCompany = (row: CompanyRow, members?: readonly CompanyMember[]): Company => ({
  id: row.id,
  name: row.name,
  description: row.description,
  avatarIcon: row.avatar_icon,
  defaultMode: row.default_mode as ExecutionMode,
  funMode: Boolean(row.fun_mode),
  moderatorMemberId: row.moderator_member_id,
  members,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const toCompanyMessage = (row: MessageRow): CompanyMessage => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderType: row.sender_type as SenderType,
  memberId: row.member_id,
  memberName: row.member_name,
  memberRole: row.member_role,
  memberColor: row.member_color,
  content: row.content,
  reasoningContent: row.reasoning_content,
  stepIndex: row.step_index,
  phase: row.phase,
  durationMs: row.duration_ms,
  tokensUsed: row.tokens_used,
  createdAt: row.created_at
})

export function listCompanyMembers(companyId: number): readonly CompanyMember[] {
  const rows = getDb()
    .prepare('SELECT * FROM company_members WHERE company_id = ? ORDER BY order_index, id')
    .all(companyId) as MemberRow[]
  return rows.map(toCompanyMember)
}

export function listCompanies(): readonly Company[] {
  const rows = getDb()
    .prepare('SELECT * FROM companies ORDER BY name COLLATE NOCASE')
    .all() as CompanyRow[]
  return rows.map((r) => toCompany(r, listCompanyMembers(r.id)))
}

export function findCompany(id: number): Company | null {
  const row = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(id) as
    | CompanyRow
    | undefined
  if (!row) return null
  return toCompany(row, listCompanyMembers(row.id))
}

export function createCompany(input: CreateCompanyInput): Company {
  const res = getDb()
    .prepare(`
      INSERT INTO companies (name, description, avatar_icon, default_mode, fun_mode)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(
      input.name,
      input.description ?? null,
      input.avatarIcon ?? 'briefcase',
      input.defaultMode ?? 'roundtable',
      input.funMode ? 1 : 0
    )
  const created = findCompany(Number(res.lastInsertRowid))
  if (!created) throw new Error('Company vanished after insert')
  return created
}

export function updateCompany(id: number, patch: UpdateCompanyInput): Company {
  const fields: string[] = ['updated_at = datetime(\'now\')']
  const params: unknown[] = []

  if (patch.name !== undefined) {
    fields.push('name = ?')
    params.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    params.push(patch.description)
  }
  if (patch.avatarIcon !== undefined) {
    fields.push('avatar_icon = ?')
    params.push(patch.avatarIcon)
  }
  if (patch.defaultMode !== undefined) {
    fields.push('default_mode = ?')
    params.push(patch.defaultMode)
  }
  if (patch.funMode !== undefined) {
    fields.push('fun_mode = ?')
    params.push(patch.funMode ? 1 : 0)
  }
  if (patch.moderatorMemberId !== undefined) {
    fields.push('moderator_member_id = ?')
    params.push(patch.moderatorMemberId)
  }

  params.push(id)
  getDb().prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...params)

  const updated = findCompany(id)
  if (!updated) throw new Error('Company not found')
  return updated
}

export function deleteCompany(id: number): void {
  getDb().prepare('DELETE FROM companies WHERE id = ?').run(id)
}

export function addCompanyMember(input: AddMemberInput): CompanyMember {
  const maxOrderRow = getDb()
    .prepare('SELECT MAX(order_index) as max_order FROM company_members WHERE company_id = ?')
    .get(input.companyId) as { max_order: number | null }
  const nextOrder = (maxOrderRow?.max_order ?? -1) + 1

  const res = getDb()
    .prepare(`
      INSERT INTO company_members (
        company_id, name, role, provider, model_id, system_prompt, temperature, order_index, avatar_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.companyId,
      input.name,
      input.role,
      input.provider,
      input.modelId,
      input.systemPrompt,
      input.temperature ?? 0.7,
      nextOrder,
      input.avatarColor ?? '#00F0FF'
    )

  const row = getDb()
    .prepare('SELECT * FROM company_members WHERE id = ?')
    .get(res.lastInsertRowid) as MemberRow
  return toCompanyMember(row)
}

export function updateCompanyMember(id: number, patch: UpdateMemberInput): CompanyMember {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.name !== undefined) {
    fields.push('name = ?')
    params.push(patch.name)
  }
  if (patch.role !== undefined) {
    fields.push('role = ?')
    params.push(patch.role)
  }
  if (patch.provider !== undefined) {
    fields.push('provider = ?')
    params.push(patch.provider)
  }
  if (patch.modelId !== undefined) {
    fields.push('model_id = ?')
    params.push(patch.modelId)
  }
  if (patch.systemPrompt !== undefined) {
    fields.push('system_prompt = ?')
    params.push(patch.systemPrompt)
  }
  if (patch.temperature !== undefined) {
    fields.push('temperature = ?')
    params.push(patch.temperature)
  }
  if (patch.avatarColor !== undefined) {
    fields.push('avatar_color = ?')
    params.push(patch.avatarColor)
  }
  if (patch.orderIndex !== undefined) {
    fields.push('order_index = ?')
    params.push(patch.orderIndex)
  }

  if (fields.length > 0) {
    params.push(id)
    getDb().prepare(`UPDATE company_members SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  }

  const row = getDb().prepare('SELECT * FROM company_members WHERE id = ?').get(id) as MemberRow
  return toCompanyMember(row)
}

export function deleteCompanyMember(id: number): void {
  getDb().prepare('DELETE FROM company_members WHERE id = ?').run(id)
}

export function listCompanyMessages(conversationId: number): readonly CompanyMessage[] {
  const rows = getDb()
    .prepare(`
      SELECT 
        m.*,
        mem.name as member_name,
        mem.role as member_role,
        mem.avatar_color as member_color
      FROM company_messages m
      LEFT JOIN company_members mem ON m.member_id = mem.id
      WHERE m.conversation_id = ?
      ORDER BY m.id ASC
    `)
    .all(conversationId) as MessageRow[]
  return rows.map(toCompanyMessage)
}

export function insertCompanyMessage(
  message: Omit<CompanyMessage, 'id' | 'createdAt' | 'memberName' | 'memberRole' | 'memberColor'>
): CompanyMessage {
  const res = getDb()
    .prepare(`
      INSERT INTO company_messages (
        conversation_id, sender_type, member_id, content, reasoning_content, step_index, phase, duration_ms, tokens_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      message.conversationId,
      message.senderType,
      message.memberId,
      message.content,
      message.reasoningContent,
      message.stepIndex,
      message.phase,
      message.durationMs,
      message.tokensUsed
    )

  const row = getDb()
    .prepare(`
      SELECT 
        m.*,
        mem.name as member_name,
        mem.role as member_role,
        mem.avatar_color as member_color
      FROM company_messages m
      LEFT JOIN company_members mem ON m.member_id = mem.id
      WHERE m.id = ?
    `)
    .get(res.lastInsertRowid) as MessageRow
  return toCompanyMessage(row)
}

export interface CompanySummary {
  readonly content: string
  /** The newest message the notes cover; every later message is still sent word for word. */
  readonly coveredUntilId: number
}

export function getCompanySummary(conversationId: number): CompanySummary | null {
  const row = getDb()
    .prepare('SELECT content, covered_until_id FROM company_summaries WHERE conversation_id = ?')
    .get(conversationId) as { content: string; covered_until_id: number } | undefined
  return row ? { content: row.content, coveredUntilId: row.covered_until_id } : null
}

/** Only ever moves forward, so a stopped run that settles late cannot undo newer notes. */
export function saveCompanySummary(conversationId: number, summary: CompanySummary): void {
  getDb()
    .prepare(`
      INSERT INTO company_summaries (conversation_id, content, covered_until_id) VALUES (?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        content = excluded.content,
        covered_until_id = excluded.covered_until_id,
        updated_at = datetime('now')
      WHERE excluded.covered_until_id > company_summaries.covered_until_id
    `)
    .run(conversationId, summary.content, summary.coveredUntilId)
}
