const assert = require('assert')

function parseChunk(rawDelta) {
  let reasoning = ''
  let content = ''
  
  if (rawDelta.reasoning_content) {
    reasoning += rawDelta.reasoning_content
  } else if (rawDelta.content) {
    content += rawDelta.content
  }
  return { reasoning, content }
}

const r1 = parseChunk({ reasoning_content: 'Let me analyze the problem first.' })
assert.strictEqual(r1.reasoning, 'Let me analyze the problem first.')
assert.strictEqual(r1.content, '')

const r2 = parseChunk({ content: 'Here is the solution.' })
assert.strictEqual(r2.reasoning, '')
assert.strictEqual(r2.content, 'Here is the solution.')

console.log('PASS  Stream parser unit test passed')
