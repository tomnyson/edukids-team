const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const {
  mentionAt,
  matchMembers,
  insertMention,
  startMention
} = require('../src/renderer/src/components/chat/mention.ts')

// Typing `@` opens a mention at the caret, with nothing typed yet
assert.deepStrictEqual(mentionAt('@', 1), { start: 0, text: '' })
assert.deepStrictEqual(mentionAt('hi @de', 6), { start: 3, text: 'de' })
assert.deepStrictEqual(mentionAt('hi\n@de', 6), { start: 3, text: 'de' })

// Only the word the caret ends: an email's `@`, a finished mention or text past it do not count
assert.strictEqual(mentionAt('mail a@b', 8), null)
assert.strictEqual(mentionAt('@DEV ', 5), null)
assert.strictEqual(mentionAt('no mention', 10), null)
assert.deepStrictEqual(mentionAt('@de rest', 3), { start: 0, text: 'de' })

const members = [
  { id: 1, name: 'Bos', role: 'CEO' },
  { id: 2, name: 'DEV', role: 'Developer' },
  { id: 3, name: 'avdvisor', role: 'Advisor' }
]
const names = (list) => list.map((member) => member.name)

// An empty query lists every member; matching ignores case
assert.deepStrictEqual(names(matchMembers(members, '')), ['Bos', 'DEV', 'avdvisor'])
assert.deepStrictEqual(names(matchMembers(members, 'dev')), ['DEV'])

// Names that start with the query come before ones that only contain it or match by role
const team = [...members, { id: 4, name: 'Vu', role: 'QA' }]
assert.deepStrictEqual(names(matchMembers(team, 'v')), ['Vu', 'DEV', 'avdvisor'])
assert.deepStrictEqual(names(matchMembers(members, 'ad')), ['avdvisor'])
assert.deepStrictEqual(names(matchMembers(members, 'zzz')), [])

// Picking replaces the typed `@query` at the caret, not the end of the prompt
assert.deepStrictEqual(insertMention('hi @de tail', { start: 3, text: 'de' }, 6, 'DEV'), {
  value: 'hi @DEV tail',
  caret: 8
})
assert.deepStrictEqual(insertMention('@', { start: 0, text: '' }, 1, 'Bos'), {
  value: '@Bos ',
  caret: 5
})

// The @ button types an `@` at the caret, spaced off a word so it still opens a mention
assert.deepStrictEqual(startMention('', 0), { value: '@', caret: 1 })
assert.deepStrictEqual(startMention('hi', 2), { value: 'hi @', caret: 4 })
assert.deepStrictEqual(startMention('hi ', 3), { value: 'hi @', caret: 4 })
assert.deepStrictEqual(startMention('ab', 1), { value: 'a @b', caret: 3 })

console.log('mention tests passed')
