const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const {
  buildContextMessages,
  planCompaction,
  summaryPrompt,
  usableSummary,
  SUMMARY_MAX_CHARS
} = require('../src/main/orchestrator/meeting-context.ts')

let nextId = 1
const user = (content) => ({ id: nextId++, senderType: 'user', memberName: null, memberRole: null, content })
const member = (name, role, content) => ({ id: nextId++, senderType: 'member', memberName: name, memberRole: role, content })
const ids = (chunks) => chunks.map((chunk) => chunk.map((message) => message.id))

// --- buildContextMessages ---

// No notes yet: exactly what every turn used to send, labels and raw user content alike
const history = [
  user('build a login page'),
  { id: nextId++, senderType: 'moderator', memberName: 'Bos', memberRole: 'CEO', content: 'framing' },
  member('DEV', 'Developer', 'use bcrypt'),
  { id: nextId++, senderType: 'member', memberName: null, memberRole: null, content: 'from a deleted member' }
]
const legacy = history.map((h) => ({
  role: h.senderType === 'user' ? 'user' : 'assistant',
  content: h.memberName ? `[${h.memberName} - ${h.memberRole}]: ${h.content}` : h.content
}))
assert.deepStrictEqual(buildContextMessages(history, null), legacy)

// With notes: they come first, labelled so a flattened prompt never reads them as a new request
const withNotes = buildContextMessages(history, { content: 'NOTES', coveredUntilId: history[1].id })
assert.strictEqual(withNotes[0].role, 'user')
assert.match(withNotes[0].content, /^\[Meeting notes/)
assert.match(withNotes[0].content, /not a new request/)
assert.match(withNotes[0].content, /NOTES$/)
// ...and only the messages after what the notes cover follow, word for word
assert.deepStrictEqual(withNotes.slice(1), legacy.slice(2))

// --- planCompaction ---

const limits = { keepRecentChars: 10, foldMinChars: 5, chunkChars: 12 }
const four = (n) => Array.from({ length: n }, (_, i) => member('DEV', 'Developer', `m${i}..`.padEnd(4, '.')))

// A short meeting is never condensed
const short = four(3)
assert.deepStrictEqual(planCompaction(short, 0, limits), [])

// The newest ~keepRecentChars stay word for word; the older rest folds in one chunk
const five = four(5)
assert.deepStrictEqual(ids(planCompaction(five, 0, limits)), [[five[0].id, five[1].id, five[2].id]])

// Chunks never pass chunkChars, and no message is ever split
assert.deepStrictEqual(
  ids(planCompaction(five, 0, { ...limits, chunkChars: 8 })),
  [[five[0].id, five[1].id], [five[2].id]]
)

// What the notes already cover is not folded again, and too little new is left alone
assert.deepStrictEqual(planCompaction(five, five[1].id, limits), [])

// The newest message stays word for word, however big it is
const bigLast = [member('A', 'r', 'aaa'), member('A', 'r', 'bbb'), user('x'.repeat(100))]
assert.deepStrictEqual(ids(planCompaction(bigLast, 0, limits)), [[bigLast[0].id, bigLast[1].id]])

// A message bigger than a chunk gets a chunk of its own
const withBig = [
  member('A', 'r', 'aaa'),
  member('A', 'r', 'b'.repeat(20)),
  member('A', 'r', 'ccc'),
  ...four(3)
]
assert.deepStrictEqual(ids(planCompaction(withBig, 0, limits)), [
  [withBig[0].id],
  [withBig[1].id],
  [withBig[2].id, withBig[3].id]
])

// --- summaryPrompt ---

const transcript = [user('ship it'), member('DEV', 'Developer', 'fixed src/app.ts')]
const first = summaryPrompt(null, transcript, 1000)
assert.match(first, /\[User\]: ship it/)
assert.match(first, /\[DEV - Developer\]: fixed src\/app\.ts/)
assert.match(first, /\(none yet\)/)
const next = summaryPrompt('decided: bcrypt', transcript, 1000)
assert.match(next, /decided: bcrypt/)
assert.doesNotMatch(next, /\(none yet\)/)

// An oversized message is clipped in the middle, keeping its start and end
const clipped = summaryPrompt(null, [member('DEV', 'Developer', `START${'x'.repeat(500)}END`)], 100)
assert.match(clipped, /START/)
assert.match(clipped, /END/)
assert.match(clipped, /characters omitted/)
assert.ok(clipped.length < 1000)

// --- usableSummary ---

assert.strictEqual(usableSummary(''), null)
assert.strictEqual(usableSummary('   \n '), null)
assert.strictEqual(usableSummary('ok'), null)
const notes = 'Decided bcrypt for passwords; DEV owns src/auth.ts and the tests.'
assert.strictEqual(usableSummary(`  ${notes}\n`), notes)
const long = usableSummary('y'.repeat(SUMMARY_MAX_CHARS * 2))
assert.ok(long.length <= SUMMARY_MAX_CHARS + 40)
assert.match(long, /clipped/)

console.log('meeting-context tests passed')
