import type { SupportedStorage } from '@supabase/supabase-js'
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import Storage from 'expo-sqlite/kv-store'

// Preferences read synchronously, so the first frame already has the saved language and theme.
export const prefs = {
  get: (key: string): string | null => Storage.getItemSync(key),
  set: (key: string, value: string): void => Storage.setItemSync(key, value),
  remove: (key: string): void => void Storage.removeItemSync(key)
}

// A session is several KB, too big for the keychain, so only its AES key lives there. THIS_DEVICE_ONLY keeps
// the key out of backups: a restored phone can't decrypt the copied session and simply asks to sign in.
const KEY_NAME = 'session-key'

const loadKey = async (): Promise<AESEncryptionKey> => {
  // An unreadable entry (Android invalidates keystore keys on some restores) is replaced; the old session then
  // fails to decrypt and the person signs in again instead of being stuck.
  const hex = await SecureStore.getItemAsync(KEY_NAME).catch(() =>
    SecureStore.deleteItemAsync(KEY_NAME).then(() => null)
  )
  if (hex) return AESEncryptionKey.import(hex, 'hex')
  const k = await AESEncryptionKey.generate()
  await SecureStore.setItemAsync(KEY_NAME, await k.encoded('hex'), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  })
  return k
}

let key: Promise<AESEncryptionKey> | undefined
// A failure isn't cached, so the next storage call tries again.
const sessionKey = (): Promise<AESEncryptionKey> =>
  (key ??= loadKey().catch((err: unknown) => {
    key = undefined
    throw err
  }))

export const sessionStorage: SupportedStorage = {
  getItem: async (name) => {
    const sealed = Storage.getItemSync(name)
    if (!sealed) return null
    // Undecryptable (key lost with a reinstall or restore) means signed out, not a crash.
    try {
      const bytes = await aesDecryptAsync(AESSealedData.fromCombined(sealed), await sessionKey())
      return new TextDecoder().decode(bytes)
    } catch {
      return null
    }
  },
  setItem: async (name, value) => {
    const sealed = await aesEncryptAsync(new TextEncoder().encode(value), await sessionKey())
    // Sync on purpose: supabase-js writes several keys at once, and the async calls' overlapping transactions fail.
    Storage.setItemSync(name, await sealed.combined('base64'))
  },
  removeItem: async (name) => {
    Storage.removeItemSync(name)
  }
}
