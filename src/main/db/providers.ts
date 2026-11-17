import type { ProviderConfig, ProviderId } from '@shared/types'
import { keychainCipher } from '../security/keychain'
import { openSecret, sealSecret } from '../security/secret-box'
import { getDb } from './connection'

interface ProviderRow {
  id: string
  api_key: string | null
  base_url: string | null
  enabled: number
}

/** Keys are sealed at rest; everything above this module sees the usable key. */
const toProviderConfig = (row: ProviderRow): ProviderConfig => ({
  id: row.id as ProviderId,
  apiKey: openSecret(row.api_key, keychainCipher),
  baseUrl: row.base_url,
  enabled: Boolean(row.enabled)
})

export function getAllProviderConfigs(): readonly ProviderConfig[] {
  const rows = getDb()
    .prepare('SELECT id, api_key, base_url, enabled FROM providers_config ORDER BY id')
    .all() as ProviderRow[]
  return rows.map(toProviderConfig)
}

export function getProviderConfig(providerId: ProviderId): ProviderConfig | null {
  const row = getDb()
    .prepare('SELECT id, api_key, base_url, enabled FROM providers_config WHERE id = ?')
    .get(providerId) as ProviderRow | undefined
  return row ? toProviderConfig(row) : null
}

/** Throws when there is a key to save and no keychain to seal it with. */
export function setProviderConfig(config: ProviderConfig): void {
  const apiKey = config.apiKey ? sealSecret(config.apiKey, keychainCipher) : null
  getDb()
    .prepare(`
      INSERT INTO providers_config (id, api_key, base_url, enabled, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        enabled = excluded.enabled,
        updated_at = datetime('now')
    `)
    .run(config.id, apiKey, config.baseUrl, config.enabled ? 1 : 0)
}
