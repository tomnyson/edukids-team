const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure parser module loads directly.
const { parseCodexLine, parseCodexModels } = require('../src/main/providers/codex-stream.ts')

// Lines captured from `codex exec --json` (codex 0.163.0)
const threadStarted = '{"type":"thread.started","thread_id":"01a18aba-9dca-7c51-b247-4a20eff0c1d7"}'
const configWarning =
  '{"type":"item.completed","item":{"id":"item_2","type":"error","message":"failed to parse hooks config /Users/me/.codex/hooks.json: EOF while parsing a value at line 1 column 0"}}'
const turnStarted = '{"type":"turn.started"}'
const agentMessage =
  '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Hi!"}}'
const turnCompleted =
  '{"type":"turn.completed","usage":{"input_tokens":27429,"cached_input_tokens":6144,"cache_write_input_tokens":0,"output_tokens":6,"reasoning_output_tokens":0}}'
const topLevelError =
  '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-4o\' model is not supported when using Codex with a ChatGPT account.\\",\\"code\\":\\"model_not_found\\"}}"}'
const turnFailed =
  '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-4o\' model is not supported when using Codex with a ChatGPT account.\\",\\"code\\":\\"model_not_found\\"}}"}}'

// Test 1: the agent message comes through, lifecycle events are ignored
assert.deepStrictEqual(parseCodexLine(agentMessage), { kind: 'message', text: 'Hi!' })
assert.strictEqual(parseCodexLine(threadStarted), null)
assert.strictEqual(parseCodexLine(turnStarted), null)

// Test 2: config warnings arrive as error items but do not fail the turn
assert.strictEqual(parseCodexLine(configWarning), null)

// Test 3: token usage is input plus output
assert.deepStrictEqual(parseCodexLine(turnCompleted), { kind: 'usage', tokensUsed: 27435 })

// Test 4: API errors are unwrapped from Codex's JSON string to the human message
const expected = {
  kind: 'error',
  message: "The 'gpt-4o' model is not supported when using Codex with a ChatGPT account."
}
assert.deepStrictEqual(parseCodexLine(topLevelError), expected)
assert.deepStrictEqual(parseCodexLine(turnFailed), expected)
assert.deepStrictEqual(parseCodexLine('{"type":"error","message":"stream disconnected"}'), {
  kind: 'error',
  message: 'stream disconnected'
})

// Test 5: malformed or partial lines are ignored
assert.strictEqual(parseCodexLine(''), null)
assert.strictEqual(parseCodexLine('Reading additional input from stdin...'), null)
assert.strictEqual(parseCodexLine('{"type":"item.completed"'), null)

// Test 6: `codex debug models` keeps listed models in priority order and drops hidden ones
const models = JSON.stringify({
  models: [
    { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide', priority: 4 },
    { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', visibility: 'list', priority: 9 },
    { slug: 'gpt-6-luna', display_name: 'GPT-6-Luna', visibility: 'list', priority: 5 },
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', visibility: 'list', priority: 8 },
    {
      slug: 'codex-auto-review',
      display_name: 'Codex Auto Review',
      visibility: 'hide',
      priority: 43
    }
  ]
})
assert.deepStrictEqual(parseCodexModels(models), [
  {
    id: 'gpt-6-luna',
    name: 'GPT-6-Luna (Codex CLI)',
    free: true,
    reasoning: true,
    provider: 'openai'
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6-Terra (Codex CLI)',
    free: true,
    reasoning: true,
    provider: 'openai'
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6-Luna (Codex CLI)',
    free: true,
    reasoning: true,
    provider: 'openai'
  }
])
assert.deepStrictEqual(parseCodexModels('not json'), [])
assert.deepStrictEqual(parseCodexModels('{"models":"nope"}'), [])

console.log('PASS  codex exec JSONL and model list parser unit tests passed')
