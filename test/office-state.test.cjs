const assert = require('assert')

require('./support/resolve-ts.cjs')

const {
  EMPTY_OFFICE,
  EXCERPT_MAX,
  activityOf,
  applyOfficeEvent,
  isThinking,
  statusLabel,
  workingAgents
} = require('../src/renderer/src/lib/office/agent-state.ts')
const {
  DOOR_SPOT,
  FLOOR,
  MAX_DESKS,
  MIN_DESK_GAP,
  deskSpots,
  leadMemberId
} = require('../src/renderer/src/lib/office/layout.ts')
const {
  DEFAULT_OFFICE_PREFS,
  parseOfficePrefs
} = require('../src/renderer/src/lib/office/prefs.ts')

const { BOARD_LINES, WALL_WORDMARK } = require('../src/renderer/src/lib/office/classroom.ts')
const { APP_NAME } = require('../src/shared/brand.ts')

const c = 7
const run = (events, start = EMPTY_OFFICE) =>
  events.reduce((state, [event, now]) => applyOfficeEvent(state, event, now ?? 0), start)

// --- One meeting, event by event ---

// Nobody has done anything yet
assert.deepStrictEqual(activityOf(EMPTY_OFFICE, 1), {
  status: 'idle',
  phase: null,
  excerpt: '',
  startedAt: null
})
assert.strictEqual(statusLabel(activityOf(EMPTY_OFFICE, 1)), 'IDLE')

// A member starts, then the phase it is in arrives
const started = run([
  [{ type: 'started', conversationId: c, memberId: 1, memberName: 'Ada (CEO)' }, 1000],
  [{ type: 'phase', conversationId: c, phase: 'framing', description: 'Ada is speaking…' }, 1001]
])
assert.strictEqual(started.activeId, 1)
assert.deepStrictEqual(activityOf(started, 1), {
  status: 'working',
  phase: 'framing',
  excerpt: '',
  startedAt: 1000
})
assert.strictEqual(statusLabel(activityOf(started, 1)), 'WORKING · framing')
assert.deepStrictEqual(workingAgents(started), [1])

// What it writes shows up as it streams; reasoning is not the reply, so it is left out
const writing = run(
  [
    [{ type: 'reasoning', conversationId: c, memberId: 1, text: 'hmm' }],
    [{ type: 'delta', conversationId: c, memberId: 1, text: 'Hello ' }],
    [{ type: 'delta', conversationId: c, memberId: 1, text: 'team.' }]
  ],
  started
)
assert.strictEqual(activityOf(writing, 1).excerpt, 'Hello team.')

// Only the tail of a long reply is kept
const long = run(
  [[{ type: 'delta', conversationId: c, memberId: 1, text: 'x'.repeat(EXCERPT_MAX) + 'END' }]],
  started
)
assert.strictEqual(activityOf(long, 1).excerpt.length, EXCERPT_MAX)
assert.ok(activityOf(long, 1).excerpt.endsWith('END'))

// Done: it keeps what it said, and nobody holds the floor
const message = { id: 5, conversationId: c, memberId: 1, content: 'Hello team.' }
const done = run([[{ type: 'member-done', conversationId: c, memberId: 1, message }]], writing)
assert.strictEqual(done.activeId, null)
assert.strictEqual(activityOf(done, 1).status, 'done')
assert.strictEqual(activityOf(done, 1).excerpt, 'Hello team.')
assert.strictEqual(statusLabel(activityOf(done, 1)), 'DONE')

// The next member takes over; the first stays done until the meeting ends
const second = run(
  [
    [{ type: 'started', conversationId: c, memberId: 2, memberName: 'Bob (Engineer)' }, 2000],
    [{ type: 'phase', conversationId: c, phase: 'debate', description: 'Bob…' }]
  ],
  done
)
assert.strictEqual(activityOf(second, 1).status, 'done')
assert.strictEqual(activityOf(second, 2).status, 'working')
assert.strictEqual(activityOf(second, 2).phase, 'debate')
assert.strictEqual(activityOf(second, 1).phase, 'framing')

// The meeting ends: everybody is idle again
const finished = run([[{ type: 'finished', conversationId: c }]], second)
assert.deepStrictEqual(workingAgents(finished), [])
assert.strictEqual(activityOf(finished, 1).status, 'idle')
assert.strictEqual(activityOf(finished, 2).status, 'idle')
assert.strictEqual(finished.activeId, null)

// A stop or a failure mid-turn ends it the same way
const failed = run(
  [[{ type: 'error', conversationId: c, error: { code: 'CANCELLED', message: 'Stopped' } }]],
  started
)
assert.deepStrictEqual(workingAgents(failed), [])
assert.strictEqual(failed.activeId, null)

// The user's own message, and work between turns, belong to no desk
const userSaved = run(
  [[{ type: 'member-done', conversationId: c, memberId: null, message }]],
  started
)
assert.strictEqual(activityOf(userSaved, 1).status, 'working')
const notes = run([
  [{ type: 'phase', conversationId: c, phase: 'notes', description: 'Condensing notes…' }]
])
assert.strictEqual(notes.activeId, null)
assert.deepStrictEqual(workingAgents(notes), [])

// A new start clears the last reply's text
const again = run(
  [[{ type: 'started', conversationId: c, memberId: 1, memberName: 'Ada (CEO)' }, 3000]],
  done
)
assert.strictEqual(activityOf(again, 1).excerpt, '')
assert.strictEqual(activityOf(again, 1).startedAt, 3000)

// Nothing is changed in place
assert.deepStrictEqual(EMPTY_OFFICE, { agents: {}, activeId: null })

// A proposal event is not office activity
assert.strictEqual(
  applyOfficeEvent(started, { type: 'proposal', conversationId: c, proposal: {} }, 0),
  started
)

// --- Thinking: from the start of a turn until the first word of the reply ---

assert.strictEqual(isThinking(activityOf(EMPTY_OFFICE, 1)), false)
assert.strictEqual(isThinking(activityOf(started, 1)), true)
// Reasoning is still thinking; the reply's first text ends it
const reasoning = run(
  [[{ type: 'reasoning', conversationId: c, memberId: 1, text: 'hmm' }]],
  started
)
assert.strictEqual(isThinking(activityOf(reasoning, 1)), true)
assert.strictEqual(isThinking(activityOf(writing, 1)), false)
// Not while done or idle, even for a turn that ended without any text
assert.strictEqual(isThinking(activityOf(done, 1)), false)
assert.strictEqual(isThinking(activityOf(failed, 1)), false)
const silent = run([[{ type: 'member-done', conversationId: c, memberId: 1, message }]], started)
assert.strictEqual(isThinking(activityOf(silent, 1)), false)
// Only the member holding the floor thinks
assert.strictEqual(isThinking(activityOf(second, 2)), true)
assert.strictEqual(isThinking(activityOf(second, 1)), false)

// --- Where the desks stand ---

assert.deepStrictEqual(deskSpots(0), [])
for (let count = 1; count <= MAX_DESKS; count++) {
  const spots = deskSpots(count)
  assert.strictEqual(spots.length, count)
  for (const spot of spots) {
    assert.ok(Math.abs(spot.x) <= FLOOR.width / 2 - 1, `x in room for ${count}`)
    assert.ok(Math.abs(spot.z) <= FLOOR.depth / 2 - 1, `z in room for ${count}`)
    assert.ok(Math.hypot(spot.x - DOOR_SPOT.x, spot.z - DOOR_SPOT.z) >= MIN_DESK_GAP)
  }
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const gap = Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z)
      assert.ok(gap >= MIN_DESK_GAP, `desks ${a} and ${b} of ${count} overlap`)
    }
  }
}
// A team larger than the room: the extra members get no desk rather than a shared one
assert.strictEqual(deskSpots(MAX_DESKS + 3).length, MAX_DESKS)
// Same team, same seats
assert.deepStrictEqual(deskSpots(5), deskSpots(5))
// The lead's desk is the first, set apart at the back
assert.ok(deskSpots(4)[0].z < deskSpots(4)[1].z)

// A classroom: the lead sits at the board and faces the class, everybody else faces the board
assert.deepStrictEqual(
  deskSpots(6).map((spot) => spot.facing),
  ['class', 'board', 'board', 'board', 'board', 'board']
)
assert.ok(BOARD_LINES.join(' ').includes('Ngày Nhà giáo Việt Nam'))
assert.ok(BOARD_LINES.length > 0 && BOARD_LINES.every((line) => line.trim().length > 0))
assert.strictEqual(WALL_WORDMARK, 'FPT Polytechnic')

// What the app calls itself
assert.strictEqual(APP_NAME, 'EduKids Team')

// The lead is the moderator in a roundtable and the first member in a pipeline
const members = [{ id: 3 }, { id: 4 }]
assert.strictEqual(leadMemberId({ defaultMode: 'roundtable', moderatorMemberId: 4, members }), 4)
assert.strictEqual(leadMemberId({ defaultMode: 'roundtable', moderatorMemberId: 9, members }), 3)
assert.strictEqual(leadMemberId({ defaultMode: 'pipeline', moderatorMemberId: 4, members }), 3)
assert.strictEqual(leadMemberId({ defaultMode: 'roundtable', moderatorMemberId: null }), null)

// --- Remembered choices ---

assert.deepStrictEqual(DEFAULT_OFFICE_PREFS, {
  view: 'chat',
  lighting: 'day',
  labels: true,
  lowPerformance: false
})
assert.deepStrictEqual(
  parseOfficePrefs('{"view":"office","lighting":"night","labels":false,"lowPerformance":true}'),
  { view: 'office', lighting: 'night', labels: false, lowPerformance: true }
)
// Anything unreadable or out of range falls back, field by field
assert.deepStrictEqual(parseOfficePrefs(null), DEFAULT_OFFICE_PREFS)
assert.deepStrictEqual(parseOfficePrefs('not json'), DEFAULT_OFFICE_PREFS)
assert.deepStrictEqual(parseOfficePrefs('[]'), DEFAULT_OFFICE_PREFS)
assert.deepStrictEqual(parseOfficePrefs('{"view":"vr","lighting":7,"labels":"yes"}'), {
  ...DEFAULT_OFFICE_PREFS
})
assert.deepStrictEqual(parseOfficePrefs('{"view":"office"}'), {
  ...DEFAULT_OFFICE_PREFS,
  view: 'office'
})

// --- The switch in Settings ---

const { DEFAULT_SETTINGS, mergeSettings, normaliseSettings } = require('../src/shared/settings.ts')
// On unless turned off; anything that is not a boolean reads as the default
assert.strictEqual(DEFAULT_SETTINGS.office3d, true)
assert.strictEqual(normaliseSettings({}).office3d, true)
assert.strictEqual(normaliseSettings({ office3d: false }).office3d, false)
assert.strictEqual(normaliseSettings({ office3d: 'no' }).office3d, true)
assert.strictEqual(mergeSettings(DEFAULT_SETTINGS, { office3d: false }).office3d, false)
assert.strictEqual(
  mergeSettings({ ...DEFAULT_SETTINGS, office3d: false }, { theme: 'light' }).office3d,
  false
)

console.log('office state tests passed')
