require('./support/resolve-ts.cjs')
const assert = require('assert')

// The runner takes its run function as a parameter, so these tests drive every run by hand.
const { createQueueRunner, classifyRun } = require('../src/main/queue/runner.ts')

const flush = () => new Promise((resolve) => setImmediate(resolve))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A runner whose runs only end when the test says so. */
function harness(options = {}) {
  const runs = []
  const changes = []
  const runner = createQueueRunner({
    maxQueued: options.maxQueued,
    run: (key, job, signal) => {
      const control = deferred()
      const entry = { key, job, signal, ...control, abortedWhilePaused: null }
      signal.addEventListener('abort', () => {
        // Read at the moment of abort: the lane must already be paused by then
        entry.abortedWhilePaused = runner.lane(key).paused
      })
      runs.push(entry)
      return control.promise
    },
    onChange: (key, lane) => changes.push({ key, lane })
  })
  const jobs = () => runs.map((entry) => entry.job)
  return { runner, runs, changes, jobs }
}

const waitingJobs = (lane) => lane.waiting.map((entry) => entry.job)

async function main() {
  // --- classification -------------------------------------------------------------------------

  assert.strictEqual(classifyRun(false, false), 'done')
  assert.strictEqual(classifyRun(false, true), 'failed')
  // An aborted run is a stop, whatever it reported
  assert.strictEqual(classifyRun(true, true), 'stopped')
  assert.strictEqual(classifyRun(true, false), 'stopped')

  // --- order: one at a time, first in first out -----------------------------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    const c = runner.submit(1, 'c')
    assert.ok(a.ok && b.ok && c.ok)
    assert.notStrictEqual(a.item.id, b.item.id)

    // Only the first starts; the rest wait in order
    assert.deepStrictEqual(jobs(), ['a'])
    assert.strictEqual(runner.lane(1).running.job, 'a')
    assert.deepStrictEqual(waitingJobs(runner.lane(1)), ['b', 'c'])

    runs[0].resolve({ failed: false, value: 'A' })
    assert.deepStrictEqual(await a.settled, { outcome: 'done', value: 'A' })
    assert.deepStrictEqual(jobs(), ['a', 'b'])

    runs[1].resolve({ failed: false, value: 'B' })
    await b.settled
    runs[2].resolve({ failed: false, value: 'C' })
    assert.deepStrictEqual(await c.settled, { outcome: 'done', value: 'C' })

    // A drained lane is forgotten, so finished conversations hold no memory
    await flush()
    assert.deepStrictEqual(runner.activeKeys(), [])
  }

  // --- lanes are independent ------------------------------------------------------------------
  {
    const { runner, jobs } = harness()
    runner.submit(1, 'one')
    runner.submit(2, 'two')
    assert.deepStrictEqual(jobs(), ['one', 'two'])
    assert.deepStrictEqual(runner.activeKeys().sort(), [1, 2])
  }

  // --- a failure pauses the rest until resumed ------------------------------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    runs[0].resolve({ failed: true, value: 'bad' })
    assert.deepStrictEqual(await a.settled, { outcome: 'failed', value: 'bad' })
    await flush()
    assert.deepStrictEqual(jobs(), ['a'])
    assert.strictEqual(runner.lane(1).paused, true)

    // A prompt sent while paused joins the held queue
    runner.submit(1, 'c')
    await flush()
    assert.deepStrictEqual(jobs(), ['a'])
    assert.deepStrictEqual(waitingJobs(runner.lane(1)), ['b', 'c'])

    runner.resume(1)
    assert.deepStrictEqual(jobs(), ['a', 'b'])
    runs[1].resolve({ failed: false, value: 'B' })
    assert.strictEqual((await b.settled).outcome, 'done')
    assert.deepStrictEqual(jobs(), ['a', 'b', 'c'])
  }

  // --- a run that throws is a failure, and the error is kept ----------------------------------
  {
    const { runner, runs } = harness()
    const a = runner.submit(1, 'a')
    runner.submit(1, 'b')
    const boom = new Error('boom')
    runs[0].reject(boom)
    const settled = await a.settled
    assert.strictEqual(settled.outcome, 'failed')
    assert.strictEqual(settled.value, null)
    assert.strictEqual(settled.error, boom)
    assert.strictEqual(runner.lane(1).paused, true)
  }

  // --- a failure with nothing waiting leaves the lane free ------------------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    runs[0].resolve({ failed: true, value: null })
    await a.settled
    runner.submit(1, 'b')
    assert.deepStrictEqual(jobs(), ['a', 'b'])
  }

  // --- stop pauses before it aborts, so the next prompt does not start ------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    runner.submit(1, 'b')
    assert.strictEqual(runner.stop(1), true)
    assert.strictEqual(runs[0].signal.aborted, true)
    assert.strictEqual(runs[0].abortedWhilePaused, true)

    // The run reports success after the abort; it still counts as a stop
    runs[0].resolve({ failed: false, value: 'partial' })
    assert.deepStrictEqual(await a.settled, { outcome: 'stopped', value: 'partial' })
    await flush()
    assert.deepStrictEqual(jobs(), ['a'])
    assert.strictEqual(runner.lane(1).paused, true)
    assert.deepStrictEqual(waitingJobs(runner.lane(1)), ['b'])

    // Nothing running: stop reports false
    assert.strictEqual(runner.stop(1), false)
    assert.strictEqual(runner.stop(99), false)
  }

  // --- a prompt sent right after a stop with an empty queue still runs ------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    runner.stop(1)
    runner.submit(1, 'b')
    runs[0].resolve({ failed: false, value: null })
    assert.strictEqual((await a.settled).outcome, 'stopped')
    assert.deepStrictEqual(jobs(), ['a', 'b'])
  }

  // --- removing a waiting prompt: it never runs, and its waiter hears why ---------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    runner.submit(1, 'c')
    assert.strictEqual(runner.remove(1, b.item.id), true)
    assert.deepStrictEqual(await b.settled, { outcome: 'cancelled', value: null })

    // The running prompt is stopped, never removed; unknown ids do nothing
    assert.strictEqual(runner.remove(1, a.item.id), false)
    assert.strictEqual(runner.remove(1, 'nope'), false)
    assert.strictEqual(runner.remove(42, 'nope'), false)

    runs[0].resolve({ failed: false, value: null })
    await a.settled
    assert.deepStrictEqual(jobs(), ['a', 'c'])
  }

  // --- clear cancels every waiting prompt and lifts the pause ---------------------------------
  {
    const { runner, runs } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    const c = runner.submit(1, 'c')
    runs[0].resolve({ failed: true, value: null })
    await a.settled
    assert.strictEqual(runner.lane(1).paused, true)

    runner.clear(1)
    assert.strictEqual((await b.settled).outcome, 'cancelled')
    assert.strictEqual((await c.settled).outcome, 'cancelled')
    assert.strictEqual(runner.lane(1).paused, false)
    assert.deepStrictEqual(runner.activeKeys(), [])
  }

  // --- drop: the conversation is gone, so nothing of its queue may run ------------------------
  {
    const { runner, runs, jobs, changes } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    runner.drop(1)
    assert.strictEqual(runs[0].signal.aborted, true)
    assert.strictEqual((await b.settled).outcome, 'cancelled')

    // The aborted run settles late, as a deleted conversation's NOT_FOUND would
    runs[0].resolve({ failed: true, value: 'deleted mid-run' })
    assert.strictEqual((await a.settled).outcome, 'stopped')
    await flush()
    assert.deepStrictEqual(jobs(), ['a'])
    assert.deepStrictEqual(runner.activeKeys(), [])
    // The last word the renderer hears about the lane is that it is empty
    const last = changes.filter((change) => change.key === 1).at(-1)
    assert.deepStrictEqual(last.lane, { running: null, waiting: [], paused: false })
  }

  // --- freezeAll on quit: nothing new starts, nothing is left waiting -------------------------
  {
    const { runner, runs, jobs } = harness()
    const a = runner.submit(1, 'a')
    const b = runner.submit(1, 'b')
    const x = runner.submit(2, 'x')
    runner.freezeAll()
    assert.strictEqual(runs[0].signal.aborted, true)
    assert.strictEqual(runs[1].signal.aborted, true)
    assert.strictEqual((await b.settled).outcome, 'cancelled')

    const late = runner.submit(1, 'late')
    assert.deepStrictEqual(late, { ok: false, reason: 'closed' })

    runs[0].resolve({ failed: false, value: null })
    runs[1].resolve({ failed: false, value: null })
    assert.strictEqual((await a.settled).outcome, 'stopped')
    assert.strictEqual((await x.settled).outcome, 'stopped')
    await flush()
    assert.deepStrictEqual(jobs(), ['a', 'x'])
  }

  // --- the cap refuses rather than dropping ---------------------------------------------------
  {
    const { runner } = harness({ maxQueued: 2 })
    runner.submit(1, 'running')
    assert.ok(runner.submit(1, 'w1').ok)
    assert.ok(runner.submit(1, 'w2').ok)
    assert.deepStrictEqual(runner.submit(1, 'w3'), { ok: false, reason: 'full' })
    assert.deepStrictEqual(waitingJobs(runner.lane(1)), ['w1', 'w2'])
  }

  // --- every change reaches the listener, start included --------------------------------------
  {
    const { runner, runs, changes } = harness()
    runner.submit(7, 'a')
    const started = changes.at(-1)
    assert.strictEqual(started.key, 7)
    assert.strictEqual(started.lane.running.job, 'a')
    runs[0].resolve({ failed: false, value: null })
    await flush()
    assert.deepStrictEqual(changes.at(-1).lane, { running: null, waiting: [], paused: false })
  }

  console.log('queue runner tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
