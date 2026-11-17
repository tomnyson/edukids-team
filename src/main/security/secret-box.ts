/**
 * Secrets at rest. A stored value is either sealed (`enc:v1:` + base64 ciphertext) or a legacy
 * plaintext key from before sealing existed. The cipher is passed in, so this stays free of
 * Electron and the rules can be tested without a keychain.
 */

export interface SecretCipher {
  readonly isAvailable: () => boolean
  readonly encrypt: (plain: string) => Buffer
  readonly decrypt: (sealed: Buffer) => string
}

export const SEALED_PREFIX = 'enc:v1:'

export const isSealed = (stored: string): boolean => stored.startsWith(SEALED_PREFIX)

/** Seals a secret, or throws: writing it in the clear would be worse than not saving it. */
export function sealSecret(plain: string, cipher: SecretCipher): string {
  if (!cipher.isAvailable()) {
    throw new Error('The system keychain is unavailable, so the key was not saved.')
  }
  return `${SEALED_PREFIX}${cipher.encrypt(plain).toString('base64')}`
}

/**
 * The usable secret, or null when there is none. A sealed value that cannot be opened is null
 * too, so ciphertext is never sent to a provider as if it were a key.
 */
export function openSecret(stored: string | null, cipher: SecretCipher): string | null {
  if (!stored) return null
  if (!isSealed(stored)) return stored
  if (!cipher.isAvailable()) return null
  try {
    return cipher.decrypt(Buffer.from(stored.slice(SEALED_PREFIX.length), 'base64'))
  } catch (error) {
    console.error('[secrets] a stored key could not be decrypted:', error)
    return null
  }
}
