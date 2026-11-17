import { execFile } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { availableParallelism, tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { VoiceSettings } from '@shared/settings'
import type { AppError, Result } from '@shared/types'
import { getEnrichedPath } from '../claude/environment'
import { forgetCliBinary, resolveCliBinary } from '../providers/cli-binary'
import { fail, ok } from '../ipc/result'
import { VOICE_TEMP_PREFIX } from './sweep'
import { isModelInstalled, modelPath } from './models'
import { cleanTranscript, whisperArgs } from './transcript'

const execFileAsync = promisify(execFile)

/** A large model on a slow CPU can take minutes for a two-minute clip. */
const RUN_TIMEOUT_MS = 300_000
const STDOUT_MAX_BYTES = 1_000_000
const STDERR_KEEP = 2_000
const MAX_THREADS = 8

/**
 * whisper.cpp's CLI, under its current name or the one Homebrew used before the rename. `fresh`
 * forgets the cached lookup, so installing it while the app runs is picked up.
 */
export async function findWhisper(fresh = false): Promise<string | null> {
  if (fresh) {
    forgetCliBinary('whisper-cli')
    forgetCliBinary('whisper-cpp')
  }
  return (await resolveCliBinary('whisper-cli')) ?? (await resolveCliBinary('whisper-cpp'))
}

function runError(error: unknown, signal: AbortSignal): AppError {
  if (signal.aborted) return { code: 'CANCELLED', message: 'Stopped.' }
  const failure = error as { killed?: boolean; stderr?: string; message?: string }
  if (failure.killed) {
    return {
      code: 'TIMEOUT',
      message: `Transcription took longer than ${RUN_TIMEOUT_MS / 1000}s and was stopped.`,
      detail: 'Pick a smaller model in Settings → Voice.'
    }
  }
  return {
    code: 'CLI_ERROR',
    message: 'whisper.cpp could not transcribe the recording.',
    detail: (failure.stderr || failure.message || '').trim().slice(-STDERR_KEEP) || undefined
  }
}

async function preflight(voice: VoiceSettings): Promise<Result<string>> {
  const binary = (await findWhisper()) ?? (await findWhisper(true))
  if (!binary) {
    return fail({
      code: 'BINARY_NOT_FOUND',
      message: 'whisper.cpp is not installed.',
      detail: 'Install it with `brew install whisper-cpp`, or switch Voice to the API backend.'
    })
  }
  if (!(await isModelInstalled(voice.localModel))) {
    return fail({
      code: 'NOT_FOUND',
      message: `The ${voice.localModel} speech model is not downloaded.`,
      detail: 'Download it in Settings → Voice.'
    })
  }
  return ok(binary)
}

/** Transcribes on this machine. The clip lives in a private temp folder only while whisper runs. */
export async function transcribeLocal(
  bytes: Uint8Array,
  voice: VoiceSettings,
  signal: AbortSignal
): Promise<Result<string>> {
  const ready = await preflight(voice)
  if (!ready.ok) return ready

  const dir = await mkdtemp(join(tmpdir(), VOICE_TEMP_PREFIX))
  try {
    const wavPath = join(dir, 'clip.wav')
    await writeFile(wavPath, bytes, { mode: 0o600 })
    const args = whisperArgs({
      modelPath: modelPath(voice.localModel),
      wavPath,
      language: voice.language,
      threads: Math.max(1, Math.min(MAX_THREADS, availableParallelism() - 1))
    })
    const { stdout } = await execFileAsync(ready.data, args, {
      env: { ...process.env, PATH: await getEnrichedPath() },
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: STDOUT_MAX_BYTES,
      signal,
      encoding: 'utf8'
    })
    return ok(cleanTranscript(stdout))
  } catch (error) {
    return fail(runError(error, signal))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
