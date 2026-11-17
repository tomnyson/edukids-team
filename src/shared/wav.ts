/**
 * 16-bit PCM WAV, the only input whisper.cpp reads. Pure and dependency-free, so the renderer
 * encodes and main validates with the same code.
 */

export const WAV_HEADER_BYTES = 44
/** whisper.cpp expects 16 kHz mono; anything else is resampled in the renderer first. */
export const SPEECH_SAMPLE_RATE = 16_000

const PCM_FORMAT = 1
const BITS_PER_SAMPLE = 16
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const FMT_CHUNK_BYTES = 16
/** A real file has three chunks; this only bounds a hostile one. */
const MAX_CHUNKS = 64

export interface WavHeader {
  readonly format: number
  readonly channels: number
  readonly sampleRate: number
  readonly bitsPerSample: number
  readonly dataBytes: number
}

/** Averages channels into one. A single channel is returned as-is, not copied. */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]

  const length = Math.min(...channels.map((channel) => channel.length))
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]
    mono[i] = sum / channels.length
  }
  return mono
}

function toPcm16(sample: number): number {
  if (!Number.isFinite(sample)) return 0
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/** Mono float samples in [-1, 1] to a complete WAV file. Out-of-range samples are clamped. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * BYTES_PER_SAMPLE
  const bytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, FMT_CHUNK_BYTES, true)
  view.setUint16(20, PCM_FORMAT, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
  view.setUint16(32, BYTES_PER_SAMPLE, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE, toPcm16(samples[i]), true)
  }
  return bytes
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

type FmtFields = Omit<WavHeader, 'dataBytes'>

function readFmt(view: DataView, body: number): FmtFields {
  return {
    format: view.getUint16(body, true),
    channels: view.getUint16(body + 2, true),
    sampleRate: view.getUint32(body + 4, true),
    bitsPerSample: view.getUint16(body + 14, true)
  }
}

/**
 * The header of a PCM WAV file, or null for anything else — including a data chunk that claims
 * more bytes than the file holds. Never guesses.
 */
export function readWavHeader(bytes: Uint8Array): WavHeader | null {
  if (bytes.length < WAV_HEADER_BYTES) return null
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fmt: FmtFields | null = null
  let offset = 12

  for (let chunk = 0; chunk < MAX_CHUNKS && offset + 8 <= bytes.length; chunk++) {
    const id = readAscii(bytes, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (body + size > bytes.length) return null

    if (id === 'fmt ') {
      if (size < FMT_CHUNK_BYTES) return null
      fmt = readFmt(view, body)
    } else if (id === 'data') {
      if (!fmt || fmt.format !== PCM_FORMAT) return null
      return { ...fmt, dataBytes: size }
    }
    // Chunks are padded to an even length
    offset = body + size + (size % 2)
  }
  return null
}

/** True only for what whisper.cpp reads without conversion: 16 kHz mono 16-bit PCM. */
export function isSpeechWav(header: WavHeader | null): boolean {
  return (
    header !== null &&
    header.format === PCM_FORMAT &&
    header.channels === 1 &&
    header.sampleRate === SPEECH_SAMPLE_RATE &&
    header.bitsPerSample === BITS_PER_SAMPLE
  )
}

/** A quarter second; anything shorter is a mis-click, not speech. */
const MIN_SPEECH_BYTES = (SPEECH_SAMPLE_RATE / 4) * BYTES_PER_SAMPLE

export type WavPayloadCheck =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: string }

/** Validates audio arriving over IPC before it is written to disk or uploaded. */
export function checkWavPayload(payload: unknown, maxBytes: number): WavPayloadCheck {
  if (!(payload instanceof Uint8Array)) {
    return { ok: false, reason: 'Audio must be sent as bytes.' }
  }
  if (payload.length > maxBytes) return { ok: false, reason: 'The recording is too long.' }

  const header = readWavHeader(payload)
  if (!header || !isSpeechWav(header)) {
    return { ok: false, reason: 'The recording is not 16 kHz mono 16-bit WAV.' }
  }
  if (header.dataBytes < MIN_SPEECH_BYTES) {
    return { ok: false, reason: 'The recording is too short.' }
  }
  return { ok: true, bytes: payload }
}
