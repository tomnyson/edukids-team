const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { insertDictation } = require('../src/renderer/src/components/chat/dictation.ts')

// Into an empty prompt the transcript lands as-is, caret after it
assert.deepStrictEqual(insertDictation('', 0, 0, 'xin chào'), { value: 'xin chào', caret: 8 })

// Appended after a word, it gets one separating space
assert.deepStrictEqual(insertDictation('hello', 5, 5, 'world'), {
  value: 'hello world',
  caret: 11
})

// After existing whitespace or a newline, no extra space is added
assert.deepStrictEqual(insertDictation('hello ', 6, 6, 'world'), {
  value: 'hello world',
  caret: 11
})
assert.deepStrictEqual(insertDictation('line\n', 5, 5, 'next'), { value: 'line\nnext', caret: 9 })

// In the middle of text it is padded on both sides, and the caret sits after the inserted words
assert.deepStrictEqual(insertDictation('ab', 1, 1, 'X'), { value: 'a X b', caret: 3 })

// Before closing punctuation no trailing space is added
assert.deepStrictEqual(insertDictation('Hi.', 2, 2, 'there'), { value: 'Hi there.', caret: 8 })

// A selection is replaced by the transcript
assert.deepStrictEqual(insertDictation('fix the bug now', 4, 11, 'that issue'), {
  value: 'fix that issue now',
  caret: 14
})

// Out-of-range or reversed positions are clamped instead of corrupting the prompt
assert.deepStrictEqual(insertDictation('abc', 99, 99, 'd'), { value: 'abc d', caret: 5 })
assert.deepStrictEqual(insertDictation('abc', 2, 1, 'X'), { value: 'ab X c', caret: 4 })

// An empty or whitespace-only transcript leaves the prompt alone
assert.deepStrictEqual(insertDictation('keep', 4, 4, '   '), { value: 'keep', caret: 4 })

console.log('dictation tests passed')
