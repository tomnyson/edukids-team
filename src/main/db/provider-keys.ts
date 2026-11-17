import type Database from 'better-sqlite3'
import { isSealed, sealSecret, type SecretCipher } from '../security/secret-box'

interface KeyRow {
  id: string
  api_key: string
}

/**
 * Seals provider keys saved before they were encrypted; returns how many it sealed. Not a schema
 * migration because it needs the keychain: without one the rows are left as they are, still
 * readable, and sealed on a later launch.
 */
export function sealLegacyProviderKeys(db: Database.Database, cipher: SecretCipher): number {
  if (!cipher.isAvailable()) return 0

  const rows = db
    .prepare("SELECT id, api_key FROM providers_config WHERE api_key IS NOT NULL AND api_key != ''")
    .all() as KeyRow[]
  const legacy = rows.filter((row) => !isSealed(row.api_key))
  if (legacy.length === 0) return 0

  const update = db.prepare('UPDATE providers_config SET api_key = ? WHERE id = ?')
  db.transaction(() => {
    for (const row of legacy) update.run(sealSecret(row.api_key, cipher), row.id)
  })()
  return legacy.length
}
