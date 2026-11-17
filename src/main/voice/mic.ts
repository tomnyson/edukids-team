import { systemPreferences } from 'electron'
import type { MicAccess, MicStatus } from '@shared/voice'

const KNOWN: ReadonlySet<string> = new Set(['granted', 'denied', 'restricted', 'not-determined'])

function currentStatus(): MicStatus {
  const status = systemPreferences.getMediaAccessStatus('microphone')
  return KNOWN.has(status) ? (status as MicStatus) : 'unknown'
}

/**
 * Asks macOS for the microphone the first time, so the consent prompt names this app before
 * Chromium touches the device. Once denied, macOS never prompts again: the user has to flip it
 * in System Settings, so the status is reported for the renderer to explain that.
 */
export async function ensureMicAccess(): Promise<MicAccess> {
  // Windows and Linux have no per-app prompt here; Chromium's own permission flow applies
  if (process.platform !== 'darwin') return { granted: true, status: 'unknown' }

  const status = currentStatus()
  if (status === 'granted') return { granted: true, status }
  if (status !== 'not-determined') return { granted: false, status }

  const granted = await systemPreferences.askForMediaAccess('microphone')
  return { granted, status: granted ? 'granted' : 'denied' }
}
