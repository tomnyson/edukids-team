const assert = require('assert')

require('./support/resolve-ts.cjs')
const {
  nextPending,
  withMessage,
  isSnapshotFor,
  rememberSent,
  findSent,
  canRetry,
  describeQueued
} = require('../src/renderer/src/lib/queueView.ts')
const { MAX_QUEUED } = require('../src/shared/queue.ts')

const id = 7

// --- nextPending: the turn on screen follows the run's own events, not the send ---

const started = nextPending(null, { type: 'started', conversationId: id, prompt: 'fix it' })
assert.deepStrictEqual(started, { prompt: 'fix it', streamed: '', activeTool: null })

const streamed = nextPending(started, { type: 'delta', conversationId: id, text: 'Hel' })
assert.deepStrictEqual(nextPending(streamed, { type: 'delta', conversationId: id, text: 'lo' }), {
  prompt: 'fix it',
  streamed: 'Hello',
  activeTool: null
})
assert.strictEqual(started.streamed, '', 'the earlier turn is not mutated')

assert.deepStrictEqual(nextPending(streamed, { type: 'tool', conversationId: id, name: 'Read' }), {
  prompt: 'fix it',
  streamed: 'Hel',
  activeTool: 'Read'
})

// Output for a turn this pane never saw start has nothing to attach to
assert.strictEqual(nextPending(null, { type: 'delta', conversationId: id, text: 'x' }), null)
assert.strictEqual(nextPending(null, { type: 'tool', conversationId: id, name: 'Read' }), null)

// A settled run leaves no pending turn, whether it stored a reply or not
assert.strictEqual(
  nextPending(streamed, { type: 'settled', conversationId: id, message: null, error: null }),
  null
)

// A second prompt's start replaces whatever the first left behind
assert.deepStrictEqual(
  nextPending(streamed, { type: 'started', conversationId: id, prompt: 'then test it' }),
  { prompt: 'then test it', streamed: '', activeTool: null }
)

// --- withMessage: a stored turn lands once, even if it is heard twice ---

const first = { id: 1, prompt: 'a' }
const second = { id: 2, prompt: 'b' }
const list = [first]
const grown = withMessage(list, second)
assert.deepStrictEqual(grown, [first, second])
assert.deepStrictEqual(list, [first], 'the old list is not mutated')
assert.strictEqual(withMessage(grown, { ...second }), grown, 'a duplicate keeps the same list')

// --- isSnapshotFor: pushes for other queues are ignored ---

const snapshot = { kind: 'solo', conversationId: id, running: null, waiting: [], paused: false }
assert.strictEqual(isSnapshotFor(snapshot, 'solo', id), true)
assert.strictEqual(isSnapshotFor(snapshot, 'company', id), false)
assert.strictEqual(isSnapshotFor(snapshot, 'solo', id + 1), false)
assert.strictEqual(isSnapshotFor(null, 'solo', id), false)
assert.strictEqual(isSnapshotFor(snapshot, 'solo', null), false)

// --- rememberSent / findSent: retry re-sends the prompt that failed, with its own options ---

const options = (model) => ({ model, effort: null, attachments: [] })
let log = []
log = rememberSent(log, { prompt: 'one', options: options('opus') })
log = rememberSent(log, { prompt: 'two', options: options('haiku') })
log = rememberSent(log, { prompt: 'one', options: options('sonnet') })

assert.deepStrictEqual(findSent(log, 'two'), { prompt: 'two', options: options('haiku') })
assert.strictEqual(findSent(log, 'one').options.model, 'sonnet', 'the latest send of a prompt wins')
assert.strictEqual(findSent(log, 'never sent'), null)
assert.strictEqual(findSent(log, null), null)

// The log keeps only as many sends as a queue can hold, plus the running one
let full = []
for (let index = 0; index < MAX_QUEUED + 5; index += 1) {
  full = rememberSent(full, { prompt: `p${index}`, options: options(null) })
}
assert.strictEqual(full.length, MAX_QUEUED + 1)
assert.strictEqual(full[0].prompt, 'p4')
assert.strictEqual(full[full.length - 1].prompt, `p${MAX_QUEUED + 4}`)

const before = rememberSent([], { prompt: 'x', options: options(null) })
rememberSent(before, { prompt: 'y', options: options(null) })
assert.strictEqual(before.length, 1, 'the old log is not mutated')

// --- canRetry: no retry while prompts wait on a paused queue (resume or clear decides) ---

const sent = { prompt: 'x', options: options(null) }
assert.strictEqual(canRetry(sent, false, 0), true)
assert.strictEqual(canRetry(sent, true, 0), true)
assert.strictEqual(canRetry(sent, false, 3), true)
assert.strictEqual(canRetry(sent, true, 2), false)
assert.strictEqual(canRetry(null, false, 0), false)

// --- describeQueued: the chips under a waiting prompt ---

const queued = (fields) => ({
  id: 'q1',
  prompt: 'p',
  model: null,
  effort: null,
  attachmentCount: 0,
  ...fields
})
assert.deepStrictEqual(describeQueued(queued({})), [])
assert.deepStrictEqual(describeQueued(queued({ model: 'opus', effort: 'xhigh' })), [
  'Opus',
  'Extra high'
])
assert.deepStrictEqual(describeQueued(queued({ attachmentCount: 1 })), ['1 file'])
assert.deepStrictEqual(describeQueued(queued({ model: 'haiku', attachmentCount: 3 })), [
  'Haiku',
  '3 files'
])

console.log('queue view tests passed')
