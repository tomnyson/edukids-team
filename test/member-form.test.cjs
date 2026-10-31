const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { toMemberInput } = require('../src/renderer/src/components/company/member-form.ts')

const draft = {
  name: 'avdvisor',
  role: '',
  provider: 'anthropic',
  modelId: 'claude-opus-5-5',
  systemPrompt: 'vip pro',
  avatarColor: '#00F0FF'
}

// An empty role no longer blocks Add: it falls back to a generic one
assert.deepStrictEqual(toMemberInput(7, draft), {
  companyId: 7,
  name: 'avdvisor',
  role: 'Member',
  provider: 'anthropic',
  modelId: 'claude-opus-5-5',
  systemPrompt: 'vip pro',
  avatarColor: '#00F0FF'
})

// Fields are trimmed; blank prompt and model get their defaults, built from the trimmed values
assert.deepStrictEqual(
  toMemberInput(7, { ...draft, name: '  Ana ', role: ' CTO ', modelId: ' ', systemPrompt: '  ' }),
  {
    companyId: 7,
    name: 'Ana',
    role: 'CTO',
    provider: 'anthropic',
    modelId: 'default',
    systemPrompt: 'You are Ana, acting as CTO.',
    avatarColor: '#00F0FF'
  }
)

// The name is the only required field
assert.strictEqual(toMemberInput(7, { ...draft, name: '   ' }), null)

console.log('member-form tests passed')
