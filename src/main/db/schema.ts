import type Database from 'better-sqlite3'

/**
 * Migrations are append-only and applied in order via `PRAGMA user_version`.
 * Never edit a shipped migration — add a new one. A step is either SQL or a
 * function, for the ones that need to compute values row by row.
 */
type Migration = string | ((db: Database.Database) => void)

/** `/a/b/project` -> `project`; the trailing slash and the root both survive it. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || path
}

/**
 * Every conversation already carried the folder it ran in, so the projects
 * table starts out mirroring that: one project per distinct directory, named
 * after it, with every existing chat attached. Nothing is lost and nothing
 * lands in "Unfiled" on first launch.
 */
function backfillProjects(db: Database.Database): void {
  const rows = db.prepare('SELECT DISTINCT cwd FROM conversations').all() as { cwd: string }[]
  const insert = db.prepare('INSERT INTO projects (name, path) VALUES (?, ?)')
  const attach = db.prepare('UPDATE conversations SET project_id = ? WHERE cwd = ?')

  for (const { cwd } of rows) {
    const id = insert.run(basename(cwd), cwd).lastInsertRowid
    attach.run(id, cwd)
  }
}

const MIGRATIONS: readonly Migration[] = [
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
  `,
  (db) => {
    db.exec(`
      CREATE TABLE projects (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT    NOT NULL,
        path           TEXT    NOT NULL UNIQUE,
        default_model  TEXT,
        default_effort TEXT,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      -- Removing a project must never take its conversations with it.
      ALTER TABLE conversations
        ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

      CREATE INDEX idx_conversations_project ON conversations(project_id);
    `)
    backfillProjects(db)
  }
]

export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number

  for (let version = current; version < MIGRATIONS.length; version++) {
    const step = MIGRATIONS[version]
    db.transaction(() => {
      if (typeof step === 'string') db.exec(step)
      else step(db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
