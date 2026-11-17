const assert = require('assert')

const {
  INITIAL_STREAM_STATE,
  feedOpenAIStream
} = require('../src/main/providers/openai-stream.ts')

const line = (payload) => `data: ${JSON.stringify(payload)}\n\n`
const content = (text) => line({ choices: [{ delta: { content: text } }] })

/** Feeds the chunks in order and returns every event they produced. */
function run(chunks) {
  let state = INITIAL_STREAM_STATE
  const events = []
  for (const chunk of chunks) {
    const step = feedOpenAIStream(state, chunk)
    state = step.state
    events.push(...step.events)
  }
  return events
}

const textOf = (events, type) =>
  events
    .filter((event) => event.type === type)
    .map((event) => event.text)
    .join('')

// Plain content, one event per delta
assert.deepStrictEqual(run([content('Hel'), content('lo')]), [
  { type: 'content', text: 'Hel' },
  { type: 'content', text: 'lo' }
])

// A line cut in half by the network is held until its newline arrives
const whole = content('split across chunks')
assert.deepStrictEqual(run([whole.slice(0, 20), whole.slice(20)]), [
  { type: 'content', text: 'split across chunks' }
])
assert.deepStrictEqual(feedOpenAIStream(INITIAL_STREAM_STATE, whole.slice(0, 20)).events, [])

// The input state is never changed
const before = { ...INITIAL_STREAM_STATE }
feedOpenAIStream(INITIAL_STREAM_STATE, whole.slice(0, 20))
assert.deepStrictEqual(INITIAL_STREAM_STATE, before)

// Reasoning sent in its own field (DeepSeek, Grok)
assert.deepStrictEqual(
  run([line({ choices: [{ delta: { reasoning_content: 'hmm' } }] }), content('answer')]),
  [
    { type: 'reasoning', text: 'hmm' },
    { type: 'content', text: 'answer' }
  ]
)

// Inline <think> tags in one delta: text around them stays content
const inline = run([content('Hi <think>weighing it</think>there')])
assert.strictEqual(textOf(inline, 'content'), 'Hi there')
assert.strictEqual(textOf(inline, 'reasoning'), 'weighing it')

// A think block that spans deltas stays reasoning until it closes
const spanning = run([content('<think>step one, '), content('step two'), content('</think>done')])
assert.strictEqual(textOf(spanning, 'reasoning'), 'step one, step two')
assert.strictEqual(textOf(spanning, 'content'), 'done')

// The final chunk carries usage and no choices
assert.deepStrictEqual(
  run([
    content('ok'),
    line({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 30, total_tokens: 42 } })
  ]),
  [
    { type: 'content', text: 'ok' },
    { type: 'usage', totalTokens: 42 }
  ]
)

// No total: the two halves are added up
assert.deepStrictEqual(run([line({ usage: { prompt_tokens: 5, completion_tokens: 7 } })]), [
  { type: 'usage', totalTokens: 12 }
])
assert.deepStrictEqual(run([line({ usage: { total_tokens: 'many' } })]), [])

// Noise is skipped: malformed JSON, comments, [DONE], CRLF endings, `data:` with no space
assert.deepStrictEqual(
  run([
    'data: {not json}\n',
    ': keep-alive\n',
    `data:${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\r\n`,
    'data: [DONE]\n',
    'event: ping\n'
  ]),
  [{ type: 'content', text: 'a' }]
)

// A delta with nothing in it produces nothing
assert.deepStrictEqual(run([line({ choices: [{ delta: {} }] }), content('')]), [])

console.log('openai stream tests passed')
