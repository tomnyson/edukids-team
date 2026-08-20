import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { migrate } from './schema'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance

  const db = new Database(join(app.getPath('userData'), 'history.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  migrate(db)

  instance = db
  return db
}

export function closeDb(): void {
  instance?.close()
  instance = null
}
