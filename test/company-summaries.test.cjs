const Database = require('better-sqlite3')
const assert = require('assert')

// schema.ts only imports better-sqlite3's types, so Node's type stripping loads it as is.
const { migrate } = require('../src/main/db/schema.ts')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
migrate(db)

assert.strictEqual(db.pragma('user_version', { simple: true }), 9)

const conversationId = db
  .prepare("INSERT INTO conversations (session_id, title, cwd) VALUES ('s1', 't', '/tmp')")
  .run().lastInsertRowid
db.prepare('INSERT INTO company_summaries (conversation_id, content, covered_until_id) VALUES (?, ?, ?)').run(
  conversationId,
  'notes',
  42
)

// One row per conversation
assert.throws(() =>
  db.prepare('INSERT INTO company_summaries (conversation_id, content, covered_until_id) VALUES (?, ?, ?)').run(
    conversationId,
    'again',
    50
  )
)

// Deleting the conversation takes its notes with it
db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM company_summaries').get().n, 0)

// Running migrate again on a current database is a no-op
migrate(db)
assert.strictEqual(db.pragma('user_version', { simple: true }), 9)

console.log('company-summaries tests passed')
