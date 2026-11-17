const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const {
  cleanTranscript,
  whisperArgs,
  modelFileName,
  modelUrl,
  cloudForm,
  parseCloudResponse,
  cloudErrorDetail,
  cloudFailureDetail,
  networkFailureDetail,
  isPlausibleApiKey,
  modelDigestMatches,
  MODEL_MIB,
  CLOUD_MODEL
} = require('../src/main/voice/transcript.ts')

// whisper-cli prints one segment per line with a leading space; they join into one prompt
assert.strictEqual(
  cleanTranscript(' Xin chào.\n Tôi cần sửa lỗi này.\n'),
  'Xin chào. Tôi cần sửa lỗi này.'
)

// Non-speech annotations are dropped, so silence yields nothing rather than "[BLANK_AUDIO]"
assert.strictEqual(cleanTranscript(' [BLANK_AUDIO]\n'), '')
assert.strictEqual(cleanTranscript('[MUSIC] fix the build [ Silence ]'), 'fix the build')
assert.strictEqual(cleanTranscript('  \n\t '), '')

// Arguments are argv entries for a shell-less spawn: model, file, language, text only
assert.deepStrictEqual(
  whisperArgs({
    modelPath: '/m/ggml-small.bin',
    wavPath: '/tmp/a.wav',
    language: 'vi',
    threads: 4
  }),
  ['-m', '/m/ggml-small.bin', '-f', '/tmp/a.wav', '-l', 'vi', '-t', '4', '-nt', '-np']
)
assert.deepStrictEqual(
  whisperArgs({ modelPath: '/m/x.bin', wavPath: '/a.wav', language: 'auto', threads: 2 }).slice(
    4,
    6
  ),
  ['-l', 'auto']
)

// Model files follow the upstream naming, and only known names map to a download URL
assert.strictEqual(modelFileName('small'), 'ggml-small.bin')
assert.strictEqual(modelFileName('large-v3'), 'ggml-large-v3.bin')
assert.strictEqual(
  modelUrl('base'),
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
)
assert.throws(() => modelFileName('../../etc/passwd'))
assert.throws(() => modelUrl('huge'))

// The cloud request names the model, asks for JSON, and only names a language when one is chosen
const auto = cloudForm('auto')
assert.deepStrictEqual(auto, { model: CLOUD_MODEL, response_format: 'json' })
assert.deepStrictEqual(cloudForm('vi'), {
  model: CLOUD_MODEL,
  response_format: 'json',
  language: 'vi'
})

// The cloud reply is untrusted JSON: only a string `text` is a transcript
assert.strictEqual(parseCloudResponse({ text: ' fix the\nbuild ' }), 'fix the build')
assert.strictEqual(parseCloudResponse({ text: '' }), '')
for (const bad of [null, 'text', {}, { text: 42 }, [{ text: 'x' }]]) {
  assert.strictEqual(parseCloudResponse(bad), null)
}

// Error bodies give a readable reason, bounded, or nothing
assert.strictEqual(
  cloudErrorDetail({ error: { message: 'Invalid file format.' } }),
  'Invalid file format.'
)
assert.strictEqual(cloudErrorDetail({ error: 'nope' }), null)
assert.strictEqual(cloudErrorDetail(null), null)
assert.strictEqual(cloudErrorDetail({ error: { message: 'x'.repeat(5000) } }).length, 500)

// A rejected key gets no provider detail: OpenAI echoes part of the key back in that message
const keyEcho = { error: { message: 'Incorrect API key provided: sk-proj-****abcd.' } }
assert.strictEqual(cloudFailureDetail(401, keyEcho), undefined)
assert.strictEqual(cloudFailureDetail(403, keyEcho), undefined)
assert.strictEqual(cloudFailureDetail(400, { error: { message: 'Bad audio.' } }), 'Bad audio.')
assert.strictEqual(cloudFailureDetail(500, null), undefined)

// A network failure shows only its system error code, never the message, which can hold the
// request's headers (and so the key) when fetch rejects them
const headerError = new TypeError('Headers.append: "Bearer sk-secret\nx" is an invalid header value.')
assert.strictEqual(networkFailureDetail(headerError), undefined)
const dnsError = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) })
assert.strictEqual(networkFailureDetail(dnsError), 'ENOTFOUND')
const oddCause = new TypeError('fetch failed', { cause: { code: 'sk-secret key' } })
assert.strictEqual(networkFailureDetail(oddCause), undefined)
assert.strictEqual(networkFailureDetail('boom'), undefined)

// A key is one run of printable ASCII; anything else could not travel in a header anyway
assert.strictEqual(isPlausibleApiKey('sk-proj-AbC_123-xyz'), true)
for (const bad of ['sk-a\nb', 'sk a', 'sk-\u00e9', 'sk-\t', '']) {
  assert.strictEqual(isPlausibleApiKey(bad), false, JSON.stringify(bad))
}

// Every model has a pinned SHA-256 from Hugging Face; a download is kept only when it matches
const TINY_SHA256 = 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'
assert.strictEqual(modelDigestMatches('tiny', TINY_SHA256), true)
assert.strictEqual(modelDigestMatches('tiny', TINY_SHA256.toUpperCase()), true)
assert.strictEqual(modelDigestMatches('tiny', '0'.repeat(64)), false)
assert.strictEqual(modelDigestMatches('base', TINY_SHA256), false)
assert.strictEqual(modelDigestMatches('huge', TINY_SHA256), false)
for (const model of Object.keys(MODEL_MIB)) {
  assert.strictEqual(modelDigestMatches(model, 'x'), false, model)
}

console.log('voice tests passed')
