const assert = require('assert')

require('./support/resolve-ts.cjs')

const {
  buildDirectMessages,
  directMember,
  directSystemPrompt
} = require('../src/main/orchestrator/single-chat.ts')
const { modeName } = require('../src/renderer/src/lib/team.ts')

const grok = { id: 1, name: 'Grok', role: 'Assistant', systemPrompt: 'You are Grok.' }
const claude = { id: 2, name: 'Claude', role: 'Reviewer', systemPrompt: 'You are Claude.' }

// The one model that answers: the chosen lead, else the first member
assert.strictEqual(directMember({ members: [grok, claude], moderatorMemberId: 2 }), claude)
assert.strictEqual(directMember({ members: [grok, claude], moderatorMemberId: null }), grok)
// A lead that was deleted falls back rather than leaving nobody to answer
assert.strictEqual(directMember({ members: [grok, claude], moderatorMemberId: 99 }), grok)
assert.strictEqual(directMember({ members: [], moderatorMemberId: null }), null)
assert.strictEqual(directMember({ moderatorMemberId: null }), null)

const history = [
  { id: 1, senderType: 'user', memberName: null, memberRole: null, content: 'What is 2+2?' },
  { id: 2, senderType: 'member', memberName: 'Grok', memberRole: 'Assistant', content: '4.' },
  { id: 3, senderType: 'user', memberName: null, memberRole: null, content: 'And 3+3?' }
]

// A direct chat is a plain transcript: no speaker labels for the model to imitate, and the
// user's newest prompt is the last message, with no meeting instruction after it
assert.deepStrictEqual(buildDirectMessages(history, null), [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '4.' },
  { role: 'user', content: 'And 3+3?' }
])

// Condensed notes replace the messages they cover
const withNotes = buildDirectMessages(history, { content: 'User asked sums.', coveredUntilId: 2 })
assert.strictEqual(withNotes.length, 2)
assert.strictEqual(withNotes[0].role, 'user')
assert.ok(withNotes[0].content.endsWith('User asked sums.'))
assert.deepStrictEqual(withNotes[1], { role: 'user', content: 'And 3+3?' })

// The system prompt is the member's own, plus the real folder; no meeting framing
const prompt = directSystemPrompt(grok, '/Users/me/project')
assert.ok(prompt.startsWith('You are Grok.'))
assert.ok(prompt.includes('/Users/me/project'))
assert.ok(!/roundtable|meeting|pipeline/i.test(prompt))

// What the user sees the mode called
assert.strictEqual(modeName({ defaultMode: 'single' }), 'Direct chat')
assert.strictEqual(modeName({ defaultMode: 'pipeline' }), 'Task pipeline')
assert.strictEqual(modeName({ defaultMode: 'roundtable' }), 'Roundtable')

console.log('single chat tests passed')
