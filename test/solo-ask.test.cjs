require('./support/resolve-ts.cjs')
const assert = require('assert')

// The pure half of a solo ask: field checks at the IPC boundary, and how a queued prompt's end
// becomes the envelope `ask` resolves with. Attachments are checked in the main process.
const {
  checkSoloFields,
  resultFromSettled,
  refusalError
} = require('../src/main/queue/solo-ask.ts')
const { LIMITS } = require('../src/shared/ipc.ts')
const { MAX_QUEUED } = require('../src/shared/queue.ts')

const invalid = (result) => {
  assert.strictEqual(result.ok, false)
  assert.strictEqual(result.error.code, 'INVALID_INPUT')
  return result.error.message
}

// --- fields -----------------------------------------------------------------------------------

// Trimmed prompt; omitted model and effort mean "use the CLI default"
assert.deepStrictEqual(checkSoloFields({ conversationId: 3, prompt: '  hi  ' }), {
  ok: true,
  data: { conversationId: 3, prompt: 'hi', model: null, effort: null }
})
assert.deepStrictEqual(
  checkSoloFields({ conversationId: 3, prompt: 'hi', model: 'opus', effort: 'high' }).data,
  { conversationId: 3, prompt: 'hi', model: 'opus', effort: 'high' }
)

// A bad id is the caller's mistake, not an app fault
for (const conversationId of [0, -1, 1.5, '3', null, undefined]) {
  assert.match(invalid(checkSoloFields({ conversationId, prompt: 'hi' })), /conversation/i)
}
for (const request of [null, undefined, 'hi', 42]) invalid(checkSoloFields(request))

assert.strictEqual(
  invalid(checkSoloFields({ conversationId: 3, prompt: '   ' })),
  'Type something first.'
)
assert.strictEqual(
  invalid(checkSoloFields({ conversationId: 3, prompt: 7 })),
  'Type something first.'
)
assert.match(
  invalid(checkSoloFields({ conversationId: 3, prompt: 'x'.repeat(LIMITS.promptMaxLength + 1) })),
  /too long/
)
// At the limit is fine
assert.strictEqual(
  checkSoloFields({ conversationId: 3, prompt: 'x'.repeat(LIMITS.promptMaxLength) }).ok,
  true
)

// Both end up in argv, so neither is taken on trust
assert.strictEqual(
  invalid(checkSoloFields({ conversationId: 3, prompt: 'hi', model: 'gpt-4' })),
  'Unknown model: gpt-4'
)
assert.strictEqual(
  invalid(checkSoloFields({ conversationId: 3, prompt: 'hi', effort: 'ludicrous' })),
  'Unknown effort: ludicrous'
)

// --- what ask resolves with -------------------------------------------------------------------

const value = { ok: true, data: { message: { id: 1 } } }
const stopped = { ok: false, error: { code: 'CANCELLED', message: 'Stopped.' } }

// A run that reported something hands that back, however it ended
assert.strictEqual(resultFromSettled({ outcome: 'done', value }), value)
assert.strictEqual(resultFromSettled({ outcome: 'failed', value: stopped }), stopped)
assert.strictEqual(resultFromSettled({ outcome: 'stopped', value: stopped }), stopped)

// Taken out of the queue before it ran
const cancelled = resultFromSettled({ outcome: 'cancelled', value: null })
assert.strictEqual(cancelled.ok, false)
assert.strictEqual(cancelled.error.code, 'CANCELLED')
assert.match(cancelled.error.message, /queue/i)

// A run that threw: the error's text goes in the detail, never a raw throw
const threw = resultFromSettled({ outcome: 'failed', value: null, error: new Error('disk gone') })
assert.strictEqual(threw.ok, false)
assert.strictEqual(threw.error.code, 'UNKNOWN')
assert.strictEqual(threw.error.detail, 'disk gone')
assert.strictEqual(
  resultFromSettled({ outcome: 'failed', value: null, error: 'odd' }).error.detail,
  'odd'
)

// --- refusals ---------------------------------------------------------------------------------

const full = refusalError('full')
assert.strictEqual(full.code, 'INVALID_INPUT')
assert.ok(full.message.includes(String(MAX_QUEUED)))
assert.strictEqual(refusalError('closed').code, 'CANCELLED')

console.log('solo ask tests passed')
