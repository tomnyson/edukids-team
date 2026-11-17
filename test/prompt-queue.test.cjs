require('./support/resolve-ts.cjs')
const assert = require('assert')

// Pure lane transitions: no electron, no timers, loaded through Node's type stripping.
const {
  emptyLane,
  enqueue,
  startNext,
  finish,
  pause,
  resume,
  remove,
  clear,
  isIdle
} = require('../src/main/queue/queue-state.ts')
const { MAX_QUEUED, isQueueKind, isConversationId } = require('../src/shared/queue.ts')

const item = (id) => ({ id, job: { prompt: `prompt ${id}` } })
const ids = (lane) => lane.waiting.map((entry) => entry.id)

// Every function returns a new lane; the input is never touched
const frozen = (lane) => Object.freeze({ ...lane, waiting: Object.freeze([...lane.waiting]) })

// --- enqueue ----------------------------------------------------------------------------------

const empty = emptyLane()
assert.deepStrictEqual(empty, { running: null, waiting: [], paused: false })
assert.strictEqual(isIdle(empty), true)

const one = enqueue(frozen(empty), item('a'))
assert.deepStrictEqual(ids(one), ['a'])
assert.strictEqual(one.running, null)
assert.strictEqual(isIdle(one), false)

// Order is arrival order
const three = enqueue(enqueue(one, item('b')), item('c'))
assert.deepStrictEqual(ids(three), ['a', 'b', 'c'])

// The cap counts waiting prompts only; past it, enqueue refuses rather than dropping one
let full = emptyLane()
for (let i = 0; i < MAX_QUEUED; i += 1) full = enqueue(full, item(`i${i}`))
assert.strictEqual(full.waiting.length, MAX_QUEUED)
assert.strictEqual(enqueue(full, item('over')), null)
assert.strictEqual(enqueue(one, item('x'), 1), null)

// --- startNext --------------------------------------------------------------------------------

// Takes the head and marks it running
const started = startNext(frozen(three))
assert.strictEqual(started.item.id, 'a')
assert.strictEqual(started.lane.running.id, 'a')
assert.deepStrictEqual(ids(started.lane), ['b', 'c'])

// Never two at once, never from an empty lane, never while paused
assert.strictEqual(startNext(started.lane), null)
assert.strictEqual(startNext(empty), null)
assert.strictEqual(startNext(pause(three)), null)

// --- finish -----------------------------------------------------------------------------------

// Success: running clears and the lane stays live, so the next can start
const done = finish(frozen(started.lane), 'done')
assert.strictEqual(done.running, null)
assert.strictEqual(done.paused, false)
assert.strictEqual(startNext(done).item.id, 'b')

// Failure pauses the rest, so one broken run does not burn through the queue
const failed = finish(started.lane, 'failed')
assert.strictEqual(failed.running, null)
assert.strictEqual(failed.paused, true)
assert.strictEqual(startNext(failed), null)

// A stop does not pause by itself: stop() pauses before it aborts. A prompt sent after an
// empty-queue stop therefore still runs.
const stopped = finish(started.lane, 'stopped')
assert.strictEqual(stopped.paused, false)
assert.strictEqual(finish(pause(started.lane), 'stopped').paused, true)

// Nothing waiting: never left paused, so the next prompt sent runs at once
const lone = startNext(one).lane
assert.strictEqual(finish(lone, 'failed').paused, false)
assert.strictEqual(isIdle(finish(lone, 'failed')), true)

// --- pause and resume -------------------------------------------------------------------------

const paused = pause(frozen(three))
assert.strictEqual(paused.paused, true)
assert.deepStrictEqual(ids(paused), ['a', 'b', 'c'])
assert.strictEqual(resume(frozen(paused)).paused, false)

// Pausing an empty lane is a no-op: paused only ever means "prompts are held back"
assert.strictEqual(pause(empty).paused, false)
assert.strictEqual(pause(lone).paused, false)

// A submit into a paused lane joins the queue and stays held
const joined = enqueue(failed, item('d'))
assert.strictEqual(joined.paused, true)
assert.deepStrictEqual(ids(joined), ['b', 'c', 'd'])

// --- remove -----------------------------------------------------------------------------------

const removed = remove(frozen(three), 'b')
assert.strictEqual(removed.removed.id, 'b')
assert.deepStrictEqual(ids(removed.lane), ['a', 'c'])

// Unknown ids and the running prompt are left alone: a running prompt is stopped, not removed
assert.strictEqual(remove(three, 'nope').removed, null)
assert.deepStrictEqual(ids(remove(three, 'nope').lane), ['a', 'b', 'c'])
assert.strictEqual(remove(started.lane, 'a').removed, null)
assert.strictEqual(remove(started.lane, 'a').lane.running.id, 'a')

// Removing the last waiting prompt clears the pause too
const lastOut = remove(pause(one), 'a')
assert.strictEqual(lastOut.lane.paused, false)
assert.strictEqual(isIdle(lastOut.lane), true)

// --- clear ------------------------------------------------------------------------------------

const cleared = clear(frozen(pause(started.lane)))
assert.deepStrictEqual(
  cleared.removed.map((entry) => entry.id),
  ['b', 'c']
)
assert.deepStrictEqual(cleared.lane.waiting, [])
assert.strictEqual(cleared.lane.paused, false)
// The running prompt is not the queue's to clear
assert.strictEqual(cleared.lane.running.id, 'a')

// --- what the renderer sees -------------------------------------------------------------------

const { toSnapshot, describeSoloJob, describeCompanyJob } = require('../src/main/queue/jobs.ts')

const soloJob = (prompt, attachments = []) => ({
  conversationId: 5,
  prompt,
  model: 'opus',
  effort: 'high',
  attachments
})
const soloItem = (id, prompt, attachments) => ({ id, job: soloJob(prompt, attachments) })

let soloLane = enqueue(emptyLane(), soloItem('s1', 'first', ['/secret/a.txt', '/secret/b.txt']))
soloLane = enqueue(soloLane, soloItem('s2', 'second'))
soloLane = pause(startNext(soloLane).lane)

const snapshot = toSnapshot('solo', 5, soloLane, describeSoloJob)
assert.deepStrictEqual(snapshot, {
  kind: 'solo',
  conversationId: 5,
  running: { id: 's1', prompt: 'first', model: 'opus', effort: 'high', attachmentCount: 2 },
  waiting: [{ id: 's2', prompt: 'second', model: 'opus', effort: 'high', attachmentCount: 0 }],
  paused: true
})
// Attachment paths stay in the main process; the renderer only learns how many there are
assert.ok(!JSON.stringify(snapshot).includes('/secret'))

assert.deepStrictEqual(toSnapshot('solo', 9, emptyLane(), describeSoloJob), {
  kind: 'solo',
  conversationId: 9,
  running: null,
  waiting: [],
  paused: false
})

// A describer cannot replace the queue's own id
const sneakyDescribe = (job) => ({ ...describeSoloJob(job), id: 'forged' })
assert.strictEqual(toSnapshot('solo', 5, soloLane, sneakyDescribe).running.id, 's1')

assert.deepStrictEqual(describeCompanyJob({ companyId: 3, prompt: 'plan it' }), {
  prompt: 'plan it',
  model: null,
  effort: null,
  attachmentCount: 0
})

// --- kinds at the IPC boundary ----------------------------------------------------------------

assert.strictEqual(isQueueKind('solo'), true)
assert.strictEqual(isQueueKind('company'), true)
for (const bad of ['SOLO', '', null, undefined, 1, {}]) assert.strictEqual(isQueueKind(bad), false)

assert.strictEqual(isConversationId(1), true)
assert.strictEqual(isConversationId(42), true)
for (const bad of [0, -3, 1.5, NaN, Infinity, '1', null, undefined]) {
  assert.strictEqual(isConversationId(bad), false)
}

console.log('prompt queue tests passed')
