import { safeStorage } from 'electron'
import type { SecretCipher } from './secret-box'

/** The OS keychain, through Electron. Only usable once the app is ready. */
export const keychainCipher: SecretCipher = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (sealed) => safeStorage.decryptString(sealed)
}
