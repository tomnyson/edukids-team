const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { isClaudeModelId } = require('../src/main/providers/claude-model.ts')

// Full ids a company member stores
assert.strictEqual(isClaudeModelId('claude-opus-5-5'), true)
assert.strictEqual(isClaudeModelId('claude-sonnet-4.5'), true)
assert.strictEqual(isClaudeModelId('claude-haiku-4-5-20251001'), true)

// Anything else would reach argv: flags, spaces, other vendors, empty
assert.strictEqual(isClaudeModelId('--dangerously-skip-permissions'), false)
assert.strictEqual(isClaudeModelId('claude-opus-5-5 --tools Bash'), false)
assert.strictEqual(isClaudeModelId('claude-'), false)
assert.strictEqual(isClaudeModelId('gpt-6-luna'), false)
assert.strictEqual(isClaudeModelId('Claude-Opus'), false)
assert.strictEqual(isClaudeModelId(''), false)
assert.strictEqual(isClaudeModelId(undefined), false)

console.log('claude-model tests passed')
