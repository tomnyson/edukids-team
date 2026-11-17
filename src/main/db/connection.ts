import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { keychainCipher } from '../security/keychain'
import { sealLegacyProviderKeys } from './provider-keys'
import { migrate } from './schema'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance

  const db = new Database(join(app.getPath('userData'), 'history.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  migrate(db)
  // After migrating, so the table exists; the app is ready by now, so the keychain is too
  try {
    sealLegacyProviderKeys(db, keychainCipher)
  } catch (error) {
    // The keys stay readable as they were; a failed seal must not keep the app from opening
    console.error('[db] provider keys could not be sealed:', error)
  }

  instance = db
  return db
}

export function closeDb(): void {
  instance?.close()
  instance = null
}
