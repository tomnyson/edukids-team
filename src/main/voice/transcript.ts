/**
 * Pure pieces of transcription: whisper.cpp argv, model names and URLs, the cloud request form,
 * and cleanup of what either backend returns. Only type imports, so tests load it directly.
 */
import type { VoiceModelId } from '@shared/settings'

export const CLOUD_MODEL = 'gpt-4o-mini-transcribe'
export const CLOUD_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'
const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

/**
 * Approximate download size of each model in MiB. Keyed by every VoiceModelId, so adding a model
 * to settings without listing it here fails to compile. Also the runtime list of valid names.
 */
export const MODEL_MIB: Readonly<Record<VoiceModelId, number>> = {
  tiny: 75,
  base: 142,
  small: 466,
  medium: 1463,
  'large-v3': 2952
}

/**
 * SHA-256 of each model file as Hugging Face publishes it (the LFS object id). A download that
 * does not hash to this is thrown away, so a truncated or swapped file never reaches whisper.
 */
const MODEL_SHA256: Readonly<Record<VoiceModelId, string>> = {
  tiny: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
  base: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
  small: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  medium: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
  'large-v3': '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2'
}

export function modelDigestMatches(name: string, hex: string): boolean {
  return isVoiceModel(name) && MODEL_SHA256[name] === hex.toLowerCase()
}

export function isVoiceModel(name: string): name is VoiceModelId {
  return Object.prototype.hasOwnProperty.call(MODEL_MIB, name)
}

/** The file name upstream publishes. Throws for unknown names, which also blocks path tricks. */
export function modelFileName(name: string): string {
  if (!isVoiceModel(name)) throw new Error(`Unknown whisper model: ${name}`)
  return `ggml-${name}.bin`
}

export function modelUrl(name: string): string {
  return `${MODEL_BASE_URL}/${modelFileName(name)}`
}

export interface WhisperArgsInput {
  readonly modelPath: string
  readonly wavPath: string
  /** Two-letter code or 'auto', already validated by settings. */
  readonly language: string
  readonly threads: number
}

/** argv for a shell-less spawn of whisper-cli: plain text on stdout, no timestamps or logs. */
export function whisperArgs(input: WhisperArgsInput): string[] {
  return [
    '-m',
    input.modelPath,
    '-f',
    input.wavPath,
    '-l',
    input.language,
    '-t',
    String(input.threads),
    '-nt',
    '-np'
  ]
}

/** Multipart text fields for the cloud request; the audio file is added by the caller. */
export function cloudForm(language: string): Readonly<Record<string, string>> {
  const base = { model: CLOUD_MODEL, response_format: 'json' }
  return language === 'auto' ? base : { ...base, language }
}

const ERROR_DETAIL_MAX = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The transcript from a cloud reply, or null when the reply is not the expected shape. */
export function parseCloudResponse(body: unknown): string | null {
  if (!isRecord(body) || typeof body.text !== 'string') return null
  return cleanTranscript(body.text)
}

/** The provider's own error message, bounded, for showing under a failure. */
export function cloudErrorDetail(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const message = body.error.message
  return typeof message === 'string' ? message.slice(0, ERROR_DETAIL_MAX) : null
}

/** What to show under a failed reply. Nothing for a rejected key: the reply echoes part of it. */
export function cloudFailureDetail(status: number, body: unknown): string | undefined {
  if (status === 401 || status === 403) return undefined
  return cloudErrorDetail(body) ?? undefined
}

/**
 * The system error code behind a failed request, such as ENOTFOUND. Never the message: fetch
 * quotes a rejected header value in it, and the Authorization header holds the key.
 */
export function networkFailureDetail(error: unknown): string | undefined {
  const cause = error instanceof Error && isRecord(error.cause) ? error.cause : null
  const code = cause?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code) ? code : undefined
}

/** One run of printable ASCII, the only thing that can travel in an HTTP header. */
export function isPlausibleApiKey(key: string): boolean {
  return /^[\x21-\x7e]+$/.test(key)
}

/**
 * Whisper marks non-speech as `[BLANK_AUDIO]`, `[MUSIC]` and the like, and prints one segment per
 * line. Both are noise in a prompt: the markers go, the lines join into one paragraph.
 */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]\n]*\]/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
