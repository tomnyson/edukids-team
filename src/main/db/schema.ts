import type Database from 'better-sqlite3'

/**
 * Migrations are append-only and applied in order via `PRAGMA user_version`.
 * Never edit a shipped migration — add a new one.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    cwd         TEXT    NOT NULL,
    session_started INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE chat_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    prompt          TEXT    NOT NULL,
    response        TEXT    NOT NULL,
    error           TEXT,
    duration_ms     INTEGER,
    cost_usd        REAL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_chat_history_conversation ON chat_history(conversation_id, id);
  CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
  `,
  `
  ALTER TABLE chat_history ADD COLUMN model TEXT;
  ALTER TABLE conversations ADD COLUMN last_model TEXT;
  `,
  `
  ALTER TABLE chat_history ADD COLUMN effort TEXT;
  ALTER TABLE conversations ADD COLUMN last_effort TEXT;
  `
]

export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number

  for (let version = current; version < MIGRATIONS.length; version++) {
    const step = MIGRATIONS[version]
    db.transaction(() => {
      db.exec(step)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
