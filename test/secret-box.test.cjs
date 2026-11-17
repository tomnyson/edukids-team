const assert = require('assert')
const Database = require('better-sqlite3')

require('./support/resolve-ts.cjs')

const {
  SEALED_PREFIX,
  isSealed,
  openSecret,
  sealSecret
} = require('../src/main/security/secret-box.ts')
const { sealLegacyProviderKeys } = require('../src/main/db/provider-keys.ts')

// Stands in for Electron's safeStorage: reversible, and visibly not the plaintext
const cipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain.split('').reverse().join(''), 'utf8'),
  decrypt: (sealed) => sealed.toString('utf8').split('').reverse().join('')
}
const noKeychain = { ...cipher, isAvailable: () => false }
const brokenKeychain = {
  ...cipher,
  decrypt: () => {
    throw new Error('keychain entry changed')
  }
}

// A sealed key carries the prefix and never the key itself
const sealed = sealSecret('xai-secret-123', cipher)
assert.ok(sealed.startsWith(SEALED_PREFIX))
assert.ok(!sealed.includes('xai-secret-123'))
assert.strictEqual(isSealed(sealed), true)
assert.strictEqual(isSealed('xai-secret-123'), false)

// It opens back to what was sealed
assert.strictEqual(openSecret(sealed, cipher), 'xai-secret-123')

// A key saved before encryption existed still works until it is sealed
assert.strictEqual(openSecret('sk-legacy-plain', cipher), 'sk-legacy-plain')
assert.strictEqual(openSecret(null, cipher), null)
assert.strictEqual(openSecret('', cipher), null)

// Without a keychain a key is refused, never written in the clear
assert.throws(() => sealSecret('xai-secret-123', noKeychain), /keychain/i)

// A sealed key that cannot be opened reads as "no key", not as garbage sent to a provider
// The failure is logged; the log is captured here so a passing run stays quiet
const logged = []
const realError = console.error
console.error = (...args) => logged.push(args)
assert.strictEqual(openSecret(sealed, noKeychain), null)
assert.strictEqual(openSecret(sealed, brokenKeychain), null)
assert.strictEqual(openSecret(`${SEALED_PREFIX}not base64 at all`, brokenKeychain), null)

console.error = realError
assert.strictEqual(logged.length, 2)

// Legacy rows are sealed in place, once
const db = new Database(':memory:')
db.exec(`
  CREATE TABLE providers_config (
    id TEXT PRIMARY KEY,
    api_key TEXT,
    base_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)
const insert = db.prepare('INSERT INTO providers_config (id, api_key) VALUES (?, ?)')
insert.run('xai', 'xai-plain')
insert.run('openai', sealSecret('sk-already', cipher))
insert.run('ollama', null)

const keyOf = (id) => db.prepare('SELECT api_key FROM providers_config WHERE id = ?').get(id).api_key

assert.strictEqual(sealLegacyProviderKeys(db, cipher), 1)
assert.ok(isSealed(keyOf('xai')))
assert.strictEqual(openSecret(keyOf('xai'), cipher), 'xai-plain')
assert.strictEqual(openSecret(keyOf('openai'), cipher), 'sk-already')
assert.strictEqual(keyOf('ollama'), null)
assert.strictEqual(sealLegacyProviderKeys(db, cipher), 0)

// No keychain: the rows are left alone and still readable
const untouched = new Database(':memory:')
untouched.exec('CREATE TABLE providers_config (id TEXT PRIMARY KEY, api_key TEXT)')
untouched.prepare('INSERT INTO providers_config (id, api_key) VALUES (?, ?)').run('xai', 'xai-plain')
assert.strictEqual(sealLegacyProviderKeys(untouched, noKeychain), 0)
assert.strictEqual(
  untouched.prepare('SELECT api_key FROM providers_config').get().api_key,
  'xai-plain'
)

console.log('secret box tests passed')
