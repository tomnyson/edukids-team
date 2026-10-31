const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { mentionedMembers } = require('../src/main/orchestrator/mentions.ts')

const members = [
  { id: 1, name: 'Bos' },
  { id: 2, name: 'tester' },
  { id: 3, name: 'Dev' },
  { id: 4, name: 'Dev Lead' }
]
const ids = (prompt) => mentionedMembers(prompt, members).map((member) => member.id)

// The prompt from the bug report, two spaces and all: only tester is addressed
assert.deepStrictEqual(ids('@tester  toi vua upload gi len'), [2])

// Names match whatever the case, mid-prompt or after a newline
assert.deepStrictEqual(ids('@dev fix it'), [3])
assert.deepStrictEqual(ids('hi\n@Bos'), [1])
assert.deepStrictEqual(ids('hi @Bos.'), [1])
assert.deepStrictEqual(ids('@Bos, @tester: look'), [1, 2])

// The longest name wins where two start at the same `@`
assert.deepStrictEqual(ids('@Dev Lead review this'), [4])
assert.deepStrictEqual(ids('@Dev Leader'), [3])

// Prompt order, each member once
assert.deepStrictEqual(ids('@tester then @Bos, and @tester again'), [2, 1])

// A name must end where the word ends, and the `@` must start a word
assert.deepStrictEqual(ids('@Bossy'), [])
assert.deepStrictEqual(ids('@Developer'), [])
assert.deepStrictEqual(ids('@Bosđi'), [])
assert.deepStrictEqual(ids('mail bos@Bos.com'), [])

// No known mention means nobody in particular was addressed, so the whole team meets
assert.deepStrictEqual(ids('@nobody hi'), [])
assert.deepStrictEqual(ids('hello team'), [])
assert.deepStrictEqual(ids('@'), [])

console.log('mentioned-members tests passed')
