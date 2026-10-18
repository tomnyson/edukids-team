const assert = require('assert')

// Unit test 1: OpenCode stdout parsing logic exactly matching opencode-adapter.ts
function parseOpenCodeOutput(rawOutput) {
  let fullReasoning = ''
  let fullContent = ''
  let inThinkingSection = false

  const lines = rawOutput.split('\n')
  for (const line of lines) {
    if (line.startsWith('> ') || line.trim() === '') {
      if (inThinkingSection && line.trim() === '') {
        inThinkingSection = false
      }
      continue
    }

    if (line.startsWith('Thinking:')) {
      inThinkingSection = true
      const thoughts = line.replace(/^Thinking:\s*/, '')
      fullReasoning += thoughts + '\n'
    } else if (inThinkingSection) {
      fullReasoning += line + '\n'
    } else {
      fullContent += line + '\n'
    }
  }

  return {
    reasoning: fullReasoning.trim(),
    content: fullContent.trim()
  }
}

const sampleCliOutput = `> build · mimo-v2.6-flash-free

Thinking: Let's analyze the question about 2+2.
We need to add 2 and 2 together.
2 plus 2 equals 4.

The sum of 2 and 2 is 4.`

const parsed = parseOpenCodeOutput(sampleCliOutput)
assert.strictEqual(parsed.reasoning, `Let's analyze the question about 2+2.\nWe need to add 2 and 2 together.\n2 plus 2 equals 4.`)
assert.strictEqual(parsed.content, `The sum of 2 and 2 is 4.`)

// Unit test 2: Free model filter & formatting
const mockModels = [
  'opencode/mimo-v2.6-flash-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/step-5-preview-free',
  'gpt-4o'
]

const processed = mockModels.map(id => ({
  id,
  name: id.replace('opencode/', ''),
  free: id.includes('-free') || id.startsWith('opencode/'),
  reasoning: true
}))

assert.strictEqual(processed.filter(m => m.free).length, 3)
assert.strictEqual(processed[0].name, 'mimo-v2.6-flash-free')
assert.strictEqual(processed[0].free, true)

// Unit test 3: OpenRouter model prioritization (Free models first)
const mockOpenRouterRaw = [
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7', pricing: { prompt: '0.003' } },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 Free', pricing: { prompt: '0' } },
  { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.005' } },
  { id: 'meta-llama/llama-3.3-70b:free', name: 'Llama 3.3 Free', pricing: { prompt: '0' } }
]

const freeOR = []
const paidOR = []
for (const m of mockOpenRouterRaw) {
  const isFree = m.id.endsWith(':free') || m.pricing?.prompt === '0'
  if (isFree) freeOR.push({ id: m.id, free: true })
  else paidOR.push({ id: m.id, free: false })
}
const sortedOR = [...freeOR, ...paidOR]
assert.strictEqual(sortedOR[0].free, true)
assert.strictEqual(sortedOR[1].free, true)
assert.strictEqual(sortedOR[2].free, false)
assert.strictEqual(sortedOR[0].id, 'deepseek/deepseek-r1:free')

console.log('PASS  OpenCode output parser, model flag, and provider sort unit tests passed')
