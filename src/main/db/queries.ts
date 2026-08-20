import { randomUUID } from 'crypto'
import { homedir } from 'os'
import type { Conversation, EffortId, Message, ModelId } from '@shared/types'
import { getDb } from './connection'

interface ConversationRow {
  id: number
  session_id: string
  title: string
  cwd: string
  session_started: number
  last_model: string | null
  last_effort: string | null
  created_at: string
  updated_at: string
  message_count: number
}

interface MessageRow {
  id: number
  conversation_id: number
  prompt: string
  response: string
  error: string | null
  model: string | null
  effort: string | null
  duration_ms: number | null
  cost_usd: number | null
  created_at: string
}

const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  sessionId: row.session_id,
  title: row.title,
  cwd: row.cwd,
  sessionStarted: row.session_started === 1,
  lastModel: row.last_model as ModelId | null,
  lastEffort: row.last_effort as EffortId | null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  messageCount: row.message_count
})

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  conversationId: row.conversation_id,
  prompt: row.prompt,
  response: row.response,
  error: row.error,
  model: row.model as ModelId | null,
  effort: row.effort as EffortId | null,
  durationMs: row.duration_ms,
  costUsd: row.cost_usd,
  createdAt: row.created_at
})

const CONVERSATION_SELECT = `
  SELECT c.*, (SELECT COUNT(*) FROM chat_history h WHERE h.conversation_id = c.id) AS message_count
  FROM conversations c
`

export function listConversations(): readonly Conversation[] {
  const rows = getDb()
    .prepare(`${CONVERSATION_SELECT} ORDER BY c.updated_at DESC, c.id DESC`)
    .all() as ConversationRow[]
  return rows.map(toConversation)
}

export function findConversation(id: number): Conversation | null {
  const row = getDb().prepare(`${CONVERSATION_SELECT} WHERE c.id = ?`).get(id) as
    ConversationRow | undefined
  return row ? toConversation(row) : null
}

export function createConversation(input: { title?: string; cwd?: string } = {}): Conversation {
  const info = getDb()
    .prepare('INSERT INTO conversations (session_id, title, cwd) VALUES (?, ?, ?)')
    .run(randomUUID(), input.title?.trim() || 'New chat', input.cwd || homedir())

  const created = findConversation(Number(info.lastInsertRowid))
  if (!created) throw new Error('Conversation vanished immediately after insert')
  return created
}

export function renameConversation(id: number, title: string): Conversation | null {
  getDb()
    .prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim() || 'Untitled', id)
  return findConversation(id)
}

export function deleteConversation(id: number): boolean {
  return getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0
}

export function listMessages(conversationId: number): readonly Message[] {
  const rows = getDb()
    .prepare('SELECT * FROM chat_history WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId) as MessageRow[]
  return rows.map(toMessage)
}

export interface InsertHistoryInput {
  readonly conversationId: number
  readonly prompt: string
  readonly response: string
  readonly error?: string | null
  readonly model?: ModelId | null
  readonly effort?: EffortId | null
  readonly durationMs?: number | null
  readonly costUsd?: number | null
}

/**
 * Writes one prompt/response pair and touches the parent conversation.
 * The first message of an untitled conversation also seeds its title.
 */
export function insertHistory(input: InsertHistoryInput): Message {
  const db = getDb()

  const write = db.transaction((): number => {
    const info = db
      .prepare(
        `INSERT INTO chat_history (conversation_id, prompt, response, error, model, effort, duration_ms, cost_usd)
         VALUES (@conversationId, @prompt, @response, @error, @model, @effort, @durationMs, @costUsd)`
      )
      .run({
        conversationId: input.conversationId,
        prompt: input.prompt,
        response: input.response,
        error: input.error ?? null,
        model: input.model ?? null,
        effort: input.effort ?? null,
        durationMs: input.durationMs ?? null,
        costUsd: input.costUsd ?? null
      })

    db.prepare(
      `UPDATE conversations
         SET updated_at = datetime('now'),
             last_model = @model,
             last_effort = @effort,
             title = CASE WHEN title = 'New chat' THEN @title ELSE title END
       WHERE id = @id`
    ).run({
      id: input.conversationId,
      model: input.model ?? null,
      effort: input.effort ?? null,
      title: deriveTitle(input.prompt)
    })

    return Number(info.lastInsertRowid)
  })

  const id = write()
  const row = db.prepare('SELECT * FROM chat_history WHERE id = ?').get(id) as MessageRow
  return toMessage(row)
}

/** Records that the CLI actually created the session, so later turns resume it. */
export function markSessionStarted(conversationId: number): void {
  getDb().prepare('UPDATE conversations SET session_started = 1 WHERE id = ?').run(conversationId)
}

function deriveTitle(prompt: string): string {
  const firstLine = prompt.trim().split('\n')[0].trim()
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || 'New chat'
}
