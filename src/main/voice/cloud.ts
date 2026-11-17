import type { VoiceSettings } from '@shared/settings'
import type { AppError, Result } from '@shared/types'
import { getVoiceApiKey } from '../settings/store'
import { fail, ok } from '../ipc/result'
import {
  CLOUD_ENDPOINT,
  cloudFailureDetail,
  cloudForm,
  networkFailureDetail,
  parseCloudResponse
} from './transcript'

const CLOUD_TIMEOUT_MS = 60_000

function statusMessage(status: number): string {
  if (status === 401) return 'The OpenAI API key was rejected.'
  if (status === 413) return 'The recording is too large for the transcription service.'
  if (status === 429)
    return 'The transcription service is rate-limiting this key or it is out of credit.'
  return `The transcription service answered ${status}.`
}

function networkError(error: unknown, signal: AbortSignal): AppError {
  if (signal.aborted) return { code: 'CANCELLED', message: 'Stopped.' }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return {
      code: 'TIMEOUT',
      message: `The transcription service did not answer within ${CLOUD_TIMEOUT_MS / 1000}s.`
    }
  }
  return {
    code: 'UNKNOWN',
    message: 'Could not reach the transcription service.',
    detail: networkFailureDetail(error)
  }
}

/** Uploads the clip to OpenAI. The key stays in main and is never logged or returned. */
export async function transcribeCloud(
  bytes: Uint8Array,
  voice: VoiceSettings,
  signal: AbortSignal
): Promise<Result<string>> {
  const key = getVoiceApiKey()
  if (!key) {
    return fail({
      code: 'INVALID_INPUT',
      message: 'No OpenAI API key is set.',
      detail: 'Add one in Settings → Voice, or switch to on-device transcription.'
    })
  }

  const form = new FormData()
  for (const [name, value] of Object.entries(cloudForm(voice.language))) form.append(name, value)
  form.append('file', new Blob([Buffer.from(bytes)], { type: 'audio/wav' }), 'clip.wav')

  let response: Response
  try {
    response = await fetch(CLOUD_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLOUD_TIMEOUT_MS)])
    })
  } catch (error) {
    return fail(networkError(error, signal))
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    return fail({
      code: 'CLI_ERROR',
      message: statusMessage(response.status),
      detail: cloudFailureDetail(response.status, body)
    })
  }
  const text = parseCloudResponse(body)
  return text === null
    ? fail({ code: 'CLI_ERROR', message: 'The transcription service sent an unexpected reply.' })
    : ok(text)
}
