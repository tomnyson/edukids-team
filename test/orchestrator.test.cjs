const assert = require('assert')

function planRoundtableTurns(members, userPrompt, moderatorId) {
  const turns = []
  // Moderator opens if configured
  const moderator = members.find((m) => m.id === moderatorId)
  if (moderator) turns.push({ member: moderator, phase: 'framing' })

  // Member turns
  for (const member of members) {
    if (member.id !== moderatorId) {
      turns.push({ member, phase: 'debate' })
    }
  }

  // Moderator summarizes
  if (moderator) turns.push({ member: moderator, phase: 'synthesis' })
  return turns
}

const mockMembers = [
  { id: 1, name: 'Grok 3', role: 'Architect' },
  { id: 2, name: 'Claude 3.7', role: 'Lead Coder' },
  { id: 3, name: 'DeepSeek R1', role: 'Moderator' }
]

const turns = planRoundtableTurns(mockMembers, 'Design a cache', 3)
assert.strictEqual(turns.length, 4) // Framing + 2 members + Synthesis
assert.strictEqual(turns[0].phase, 'framing')
assert.strictEqual(turns[0].member.id, 3)
assert.strictEqual(turns[1].member.name, 'Grok 3')
assert.strictEqual(turns[3].phase, 'synthesis')

// A failed turn names the member and its model, so the user knows which setting to fix
const { memberErrorMessage } = require('../src/main/orchestrator/member-error.ts')
const dev = { name: 'DEV', provider: 'gemini', modelId: 'gemini-fash 3.8' }
assert.strictEqual(
  memberErrorMessage(dev, new Error('Antigravity CLI (agy): model not recognized')),
  'DEV (gemini · gemini-fash 3.8): Antigravity CLI (agy): model not recognized'
)
assert.strictEqual(memberErrorMessage(dev, 'boom'), 'DEV (gemini · gemini-fash 3.8): boom')

console.log('PASS  Orchestrator turn plan unit test passed')
