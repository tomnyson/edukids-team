const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure parser module loads directly.
const { parseAgyLine, parseAgyGeminiModels } = require('../src/main/providers/agy-stream.ts')

// Lines captured from `agy -p ... --output-format stream-json` (agy 1.4.10)
const userInput =
  '{"event":"step_update","step_update":{"conversation_id":"d8a8","step_index":0,"state":"DONE","step_type":"user_input"}}'
const delta =
  '{"event":"step_update","step_update":{"conversation_id":"d8a8","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"No, 391 is not prime"}}'
const lastDelta =
  '{"event":"step_update","step_update":{"conversation_id":"d8a8","step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"\\n","duration_seconds":6.8,"usage":{"input_tokens":32440,"output_tokens":476,"thinking_tokens":441,"cache_read_tokens":0,"total_tokens":32916}}}'
const success =
  '{"event":"result","result":{"conversation_id":"d8a8","status":"SUCCESS","response":"No, 391 is not prime.\\n","duration_seconds":7.48,"num_turns":1,"usage":{"input_tokens":32440,"output_tokens":476,"thinking_tokens":441,"cache_read_tokens":0,"total_tokens":32916}}}'
const failure =
  '{"event":"result","result":{"conversation_id":"","status":"ERROR","response":"","error":"invalid model selection (--model \\"bogus\\" --effort \\"\\"): model bogus is not recognized as a known model or custom model in settings","duration_seconds":0,"num_turns":0,"usage":{"total_tokens":0}}}'
const init =
  '{"event":"init","conversation_id":"7a8b","init":{"model":"gemini-3.8-flash-low","tools":[]}}'
const deniedEmpty =
  '{"event":"result","result":{"conversation_id":"8c63","status":"SUCCESS","response":"","duration_seconds":9.75,"num_turns":1,"usage":{"input_tokens":33280,"output_tokens":439,"thinking_tokens":402,"cache_read_tokens":0,"total_tokens":33719},"denied_actions":[{"action":"command","display_name":"RunCommand"}]}}'

// Test 1: agent text deltas stream through, other steps are ignored
assert.deepStrictEqual(parseAgyLine(delta), { kind: 'delta', text: 'No, 391 is not prime' })
assert.deepStrictEqual(parseAgyLine(lastDelta), { kind: 'delta', text: '\n' })
assert.strictEqual(parseAgyLine(userInput), null)
assert.strictEqual(parseAgyLine(init), null)

// Test 2: the final result carries the full response and token usage
assert.deepStrictEqual(parseAgyLine(success), {
  kind: 'result',
  response: 'No, 391 is not prime.\n',
  tokensUsed: 32916
})

// Test 3: an ERROR result surfaces agy's own message
const error = parseAgyLine(failure)
assert.strictEqual(error.kind, 'error')
assert.match(error.message, /model bogus is not recognized/)
assert.deepStrictEqual(parseAgyLine('{"event":"result","result":{"status":"CANCELLED"}}'), {
  kind: 'error',
  message: 'agy finished with status CANCELLED'
})

// Test 4: an empty reply after headless mode denied a tool is an error, not a blank message
const denied = parseAgyLine(deniedEmpty)
assert.strictEqual(denied.kind, 'error')
assert.match(denied.message, /RunCommand/)
const deniedWithText = JSON.parse(deniedEmpty)
deniedWithText.result.response = 'Answer anyway.'
assert.deepStrictEqual(parseAgyLine(JSON.stringify(deniedWithText)), {
  kind: 'result',
  response: 'Answer anyway.',
  tokensUsed: 33719
})

// Test 5: non-JSON and malformed lines never throw
assert.strictEqual(parseAgyLine(''), null)
assert.strictEqual(parseAgyLine('not json'), null)
assert.strictEqual(parseAgyLine('[1,2]'), null)
assert.strictEqual(parseAgyLine('{"event":"step_update","step_update":"nope"}'), null)

// Test 6: `agy models` output keeps only Gemini models, in CLI order
const modelsStdout = [
  'Fetching available models...',
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
  ''
].join('\n')
const models = parseAgyGeminiModels(modelsStdout)
assert.deepStrictEqual(
  models.map((m) => m.id),
  ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low']
)
assert.strictEqual(models[0].name, 'Gemini 3.8 Flash (High) (Antigravity CLI)')
assert.strictEqual(models[0].provider, 'gemini')
assert.deepStrictEqual(parseAgyGeminiModels(''), [])

console.log('PASS  agy stream-json and model list parser unit tests passed')
