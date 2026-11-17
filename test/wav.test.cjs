const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const {
  encodeWav,
  readWavHeader,
  downmixToMono,
  isSpeechWav,
  checkWavPayload,
  WAV_HEADER_BYTES
} = require('../src/shared/wav.ts')

// Mono passes through untouched; stereo is averaged sample by sample
const mono = new Float32Array([0.5, -0.5])
assert.strictEqual(downmixToMono([mono]), mono)
const left = new Float32Array([1, 0, -1])
const right = new Float32Array([0, 0, 1])
assert.deepStrictEqual(Array.from(downmixToMono([left, right])), [0.5, 0, 0])
assert.strictEqual(downmixToMono([]).length, 0)

// A 16 kHz mono clip encodes to a 44-byte header plus two bytes per sample
const samples = new Float32Array([0, 1, -1, 0.5, 2, -2])
const bytes = encodeWav(samples, 16000)
assert.ok(bytes instanceof Uint8Array)
assert.strictEqual(WAV_HEADER_BYTES, 44)
assert.strictEqual(bytes.length, 44 + samples.length * 2)
assert.strictEqual(Buffer.from(bytes.subarray(0, 4)).toString('ascii'), 'RIFF')
assert.strictEqual(Buffer.from(bytes.subarray(8, 12)).toString('ascii'), 'WAVE')

// Samples are 16-bit little-endian PCM, and anything past ±1 is clamped rather than wrapped
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const pcm = (index) => view.getInt16(44 + index * 2, true)
assert.strictEqual(pcm(0), 0)
assert.strictEqual(pcm(1), 32767)
assert.strictEqual(pcm(2), -32768)
assert.strictEqual(pcm(3), 16384)
assert.strictEqual(pcm(4), 32767)
assert.strictEqual(pcm(5), -32768)

// The header reads back what was written
assert.deepStrictEqual(readWavHeader(bytes), {
  format: 1,
  channels: 1,
  sampleRate: 16000,
  bitsPerSample: 16,
  dataBytes: samples.length * 2
})

// Anything that is not a RIFF/WAVE PCM file is refused, never guessed at
assert.strictEqual(readWavHeader(new Uint8Array(10)), null)
const notWav = Uint8Array.from(bytes)
notWav[0] = 0x58
assert.strictEqual(readWavHeader(notWav), null)
const notWave = Uint8Array.from(bytes)
notWave[8] = 0x58
assert.strictEqual(readWavHeader(notWave), null)

// A data chunk claiming more bytes than the file holds is a lie
const truncated = bytes.subarray(0, bytes.length - 2)
assert.strictEqual(readWavHeader(truncated), null)

// An empty recording is still a valid file, just with no samples
const empty = encodeWav(new Float32Array(0), 16000)
assert.strictEqual(empty.length, 44)
assert.strictEqual(readWavHeader(empty).dataBytes, 0)

// Main only hands whisper.cpp what it reads: 16 kHz, mono, 16-bit PCM
assert.strictEqual(isSpeechWav(readWavHeader(bytes)), true)
assert.strictEqual(isSpeechWav(readWavHeader(encodeWav(samples, 44100))), false)
assert.strictEqual(isSpeechWav(null), false)

// The IPC boundary takes bytes only, bounded, in whisper's format, with enough audio to transcribe
const quarterSecond = encodeWav(new Float32Array(4000), 16000)
assert.deepStrictEqual(checkWavPayload(quarterSecond, 1_000_000), {
  ok: true,
  bytes: quarterSecond
})
assert.strictEqual(checkWavPayload(Buffer.from(quarterSecond), 1_000_000).ok, true)
for (const bad of [null, 'RIFF', [1, 2, 3], quarterSecond.buffer, { length: 10 }]) {
  assert.strictEqual(checkWavPayload(bad, 1_000_000).ok, false)
}
assert.match(checkWavPayload(quarterSecond, 100).reason, /too long/)
assert.match(checkWavPayload(encodeWav(new Float32Array(4000), 44100), 1_000_000).reason, /16 kHz/)
assert.match(
  checkWavPayload(encodeWav(new Float32Array(100), 16000), 1_000_000).reason,
  /too short/
)
assert.match(checkWavPayload(new Uint8Array(60), 1_000_000).reason, /16 kHz/)

console.log('wav tests passed')
