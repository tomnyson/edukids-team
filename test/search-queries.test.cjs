const assert = require('assert')

require('./support/resolve-ts.cjs')

const {
  MAX_QUERIES,
  MAX_QUERY_LENGTH,
  buildQueryMessages,
  fallbackQuery,
  parseQueries
} = require('../src/main/search/queries.ts')

// One query per line
assert.deepStrictEqual(parseQueries('electron 39 release notes\nelectron safeStorage api'), [
  'electron 39 release notes',
  'electron safeStorage api'
])

// Bullets, numbering and quotes are how models decorate a list
assert.deepStrictEqual(parseQueries('1. "first query"\n- second query\n* `third query`'), [
  'first query',
  'second query',
  'third query'
])

// "none" means no search is needed: null, which is different from "could not tell"
assert.strictEqual(parseQueries('none'), null)
assert.strictEqual(parseQueries('  NONE.  '), null)
assert.strictEqual(parseQueries('"none"'), null)

// Never more than the cap, never a duplicate
const many = parseQueries('a b\nc d\ne f\ng h\ni j')
assert.strictEqual(many.length, MAX_QUERIES)
assert.deepStrictEqual(parseQueries('same thing\nSame Thing\nother'), ['same thing', 'other'])

// Prose instead of queries: nothing usable, so the caller falls back
assert.deepStrictEqual(parseQueries(''), [])
assert.deepStrictEqual(parseQueries('   \n  \n'), [])
assert.deepStrictEqual(parseQueries('x'.repeat(MAX_QUERY_LENGTH + 1)), [])
assert.deepStrictEqual(parseQueries(42), [])

// A long line is dropped, the good ones beside it kept
assert.deepStrictEqual(parseQueries(`${'y'.repeat(MAX_QUERY_LENGTH + 1)}\nshort one`), [
  'short one'
])

// The fallback is the user's own words, one line, clipped
assert.strictEqual(
  fallbackQuery('  What is new in Electron?\nPlease be brief.'),
  'What is new in Electron?'
)
assert.strictEqual(fallbackQuery('z'.repeat(500)).length, MAX_QUERY_LENGTH)
assert.strictEqual(fallbackQuery('   '), '')

// The query step sees the recent transcript and ends on the instruction, dated today
const messages = buildQueryMessages(
  [
    { role: 'user', content: 'Who makes Electron?' },
    { role: 'assistant', content: 'The OpenJS Foundation hosts it.' },
    { role: 'user', content: 'What is its latest version?' }
  ],
  '2026-11-16'
)
assert.strictEqual(messages.at(-1).role, 'user')
assert.ok(messages.at(-1).content.includes('2026-11-16'))
assert.ok(messages.at(-1).content.includes('What is its latest version?'))
assert.ok(messages.some((message) => message.content.includes('OpenJS Foundation')))

// What the model already found is shown when asking what is still missing
const followUp = buildQueryMessages([{ role: 'user', content: 'Compare A and B' }], '2026-11-16', [
  { title: 'About A', url: 'https://a.example/' }
])
assert.ok(followUp.at(-1).content.includes('About A'))
assert.ok(followUp.at(-1).content.includes('https://a.example/'))

console.log('search queries tests passed')
