import { LIMITS } from '@shared/ipc'
import type { Result } from '@shared/types'
import { checkWavPayload } from '@shared/wav'
import { fail } from '../ipc/result'
import { getSettings } from '../settings/store'
import { transcribeCloud } from './cloud'
import { transcribeLocal } from './local-whisper'

/** One dictation at a time; a new clip supersedes one still transcribing. */
let current: AbortController | null = null

/** Validates the clip at the IPC boundary, then hands it to the backend chosen in settings. */
export async function transcribe(payload: unknown): Promise<Result<string>> {
  const check = checkWavPayload(payload, LIMITS.voiceMaxBytes)
  if (!check.ok) return fail({ code: 'INVALID_INPUT', message: check.reason })

  current?.abort()
  const controller = new AbortController()
  current = controller
  try {
    const voice = getSettings().voice
    return voice.backend === 'cloud'
      ? await transcribeCloud(check.bytes, voice, controller.signal)
      : await transcribeLocal(check.bytes, voice, controller.signal)
  } finally {
    if (current === controller) current = null
  }
}

export function cancelTranscription(): void {
  current?.abort()
}
