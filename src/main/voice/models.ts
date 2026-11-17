import { app } from 'electron'
import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import { VOICE_MODELS, type VoiceModelId } from '@shared/settings'
import type { AppError } from '@shared/types'
import type { VoiceDownloadProgress, VoiceModelStatus } from '@shared/voice'
import { STALE_AFTER_MS, VOICE_TEMP_PREFIX, sweepStale } from './sweep'
import { MODEL_MIB, modelDigestMatches, modelFileName, modelUrl } from './transcript'

const MIB = 1024 * 1024
/** A finished file under this share of the expected size is an error page, not a model. */
const MIN_SIZE_SHARE = 0.9
const PROGRESS_INTERVAL_MS = 250

export type ProgressSink = (progress: VoiceDownloadProgress) => void

/** One download per model; the controller cancels it. */
const downloads = new Map<VoiceModelId, AbortController>()

const modelsDir = (): string => join(app.getPath('userData'), 'whisper-models')

export const modelPath = (model: VoiceModelId): string => join(modelsDir(), modelFileName(model))

const minimumBytes = (model: VoiceModelId): number => MODEL_MIB[model] * MIB * MIN_SIZE_SHARE

export async function isModelInstalled(model: VoiceModelId): Promise<boolean> {
  try {
    return (await stat(modelPath(model))).size >= minimumBytes(model)
  } catch {
    return false
  }
}

export function listModelStatus(): Promise<VoiceModelStatus[]> {
  return Promise.all(
    VOICE_MODELS.map(async (model) => ({
      model,
      installed: await isModelInstalled(model),
      approxMib: MODEL_MIB[model],
      downloading: downloads.has(model)
    }))
  )
}

/** Streams the model into `partial`, reporting progress, and returns the bytes written. */
async function fetchToFile(
  model: VoiceModelId,
  partial: string,
  signal: AbortSignal,
  emit: ProgressSink
): Promise<number> {
  const response = await fetch(modelUrl(model), { signal })
  if (!response.ok || !response.body) {
    throw new Error(`The download server answered ${response.status}.`)
  }

  // Hugging Face redirects to a CDN that may omit the length; the rough size keeps the bar moving
  const declared = Number(response.headers.get('content-length'))
  const totalBytes = declared > 0 ? declared : MODEL_MIB[model] * MIB
  let receivedBytes = 0
  let lastEmit = 0
  const digest = createHash('sha256')

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      receivedBytes += chunk.length
      digest.update(chunk)
      const now = Date.now()
      if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
        lastEmit = now
        emit({ model, receivedBytes, totalBytes, done: false, error: null })
      }
      done(null, chunk)
    }
  })

  const body = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>)
  await pipeline(body, counter, createWriteStream(partial), { signal })

  if (declared > 0 && receivedBytes !== declared) {
    throw new Error(`The download stopped at ${receivedBytes} of ${declared} bytes.`)
  }
  if (receivedBytes < minimumBytes(model)) {
    throw new Error('The server sent something other than a model file.')
  }
  if (!modelDigestMatches(model, digest.digest('hex'))) {
    throw new Error('The downloaded file does not match the published checksum.')
  }
  return receivedBytes
}

function downloadError(error: unknown, aborted: boolean): AppError {
  if (aborted) return { code: 'CANCELLED', message: 'Download stopped.' }
  return {
    code: 'UNKNOWN',
    message: 'Could not download the speech model.',
    detail: error instanceof Error ? error.message : String(error)
  }
}

/**
 * Downloads to `<name>.part` and renames on success, so a half-written file is never mistaken
 * for a model. Resolves to null on success or the error, which is also pushed as the final event.
 */
export async function downloadModel(
  model: VoiceModelId,
  emit: ProgressSink
): Promise<AppError | null> {
  if (downloads.has(model)) {
    return { code: 'INVALID_INPUT', message: `The ${model} model is already downloading.` }
  }
  const controller = new AbortController()
  downloads.set(model, controller)
  const target = modelPath(model)
  const partial = `${target}.part`

  try {
    await mkdir(modelsDir(), { recursive: true })
    const receivedBytes = await fetchToFile(model, partial, controller.signal, emit)
    await rename(partial, target)
    emit({ model, receivedBytes, totalBytes: receivedBytes, done: true, error: null })
    return null
  } catch (error) {
    await rm(partial, { force: true })
    const failure = downloadError(error, controller.signal.aborted)
    emit({ model, receivedBytes: 0, totalBytes: 0, done: true, error: failure })
    return failure
  } finally {
    downloads.delete(model)
  }
}

export function cancelDownload(model: VoiceModelId): void {
  downloads.get(model)?.abort()
}

export function cancelAllDownloads(): void {
  for (const controller of downloads.values()) controller.abort()
}

/** Clears clips and half-downloaded models that a quit or crash left behind. Never rejects. */
export async function sweepVoiceLeftovers(): Promise<void> {
  await Promise.all([
    sweepStale(tmpdir(), (name) => name.startsWith(VOICE_TEMP_PREFIX), STALE_AFTER_MS),
    sweepStale(modelsDir(), (name) => name.endsWith('.part'), STALE_AFTER_MS)
  ])
}
