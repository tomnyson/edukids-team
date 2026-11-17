const assert = require('assert')
const Database = require('better-sqlite3')

require('./support/resolve-ts.cjs')

const { MAX_MEMBERS, PROPOSAL_LIMITS, toProposalDraft } = require('../src/shared/proposals.ts')
const {
  PROPOSAL_FENCE,
  extractProposal,
  proposalInstruction
} = require('../src/main/orchestrator/proposal.ts')
const { migrate } = require('../src/main/db/schema.ts')
const {
  hasPendingProposal,
  insertProposal,
  findProposal,
  listProposals,
  rejectedProposalNames,
  resolveProposal
} = require('../src/main/db/member-proposals.ts')

const block = (body) => `\`\`\`${PROPOSAL_FENCE}\n${body}\n\`\`\``
const valid = {
  name: 'Lena',
  role: 'Security Reviewer',
  systemPrompt: 'You review code for security problems.',
  provider: 'openai',
  modelId: 'gpt-x',
  reason: 'Nobody on the team covers security.'
}
const context = {
  memberNames: ['Ada', 'Bob'],
  providers: ['anthropic', 'openai'],
  fallback: { provider: 'anthropic', modelId: 'claude-x' }
}

// --- Finding the block in a reply ---

// The block is cut out of what the user reads; the text around it stays
const found = extractProposal(
  `Here is the plan.\n\n${block(JSON.stringify(valid))}\n\nLet us begin.`
)
assert.deepStrictEqual(found.raw, valid)
assert.strictEqual(found.content, 'Here is the plan.\n\nLet us begin.')

// No block: the reply is untouched
assert.deepStrictEqual(extractProposal('Just a plan.'), { content: 'Just a plan.', raw: null })

// A block that is not JSON is removed and counts as no proposal, so the run goes on
const broken = extractProposal(`Plan.\n${block('{not json')}`)
assert.strictEqual(broken.raw, null)
assert.strictEqual(broken.content, 'Plan.')

// Only the first of several is read; all are removed
const twice = extractProposal(
  `${block(JSON.stringify(valid))}\nmiddle\n${block(JSON.stringify({ ...valid, name: 'Second' }))}`
)
assert.strictEqual(twice.raw.name, 'Lena')
assert.strictEqual(twice.content, 'middle')

// Another kind of code block is not a proposal
const other = '```json\n{"name":"x"}\n```'
assert.deepStrictEqual(extractProposal(other), { content: other, raw: null })

// A reply that is nothing but the block still has something to show
assert.ok(extractProposal(block(JSON.stringify(valid))).content.length > 0)

// --- Rebuilding what the model wrote, field by field ---

assert.deepStrictEqual(toProposalDraft(valid, context), valid)

// Trimmed, a leading @ dropped, unknown keys ignored
assert.deepStrictEqual(
  toProposalDraft({ ...valid, name: '  @Lena ', role: ' Reviewer ', extra: 'x' }, context),
  { ...valid, role: 'Reviewer' }
)

// A provider the team does not use, or no model: the CEO's own model is used
assert.deepStrictEqual(toProposalDraft({ ...valid, provider: 'evilcorp' }, context), {
  ...valid,
  provider: 'anthropic',
  modelId: 'claude-x'
})
assert.deepStrictEqual(toProposalDraft({ ...valid, modelId: '' }, context), {
  ...valid,
  provider: 'anthropic',
  modelId: 'claude-x'
})
const noModel = { ...valid }
delete noModel.provider
delete noModel.modelId
assert.strictEqual(toProposalDraft(noModel, context).modelId, 'claude-x')

// A reason is optional
assert.strictEqual(toProposalDraft({ ...valid, reason: undefined }, context).reason, '')

// Refused: not an object, a missing or wrong-typed field, a name already on the team
for (const raw of [
  null,
  'text',
  [],
  42,
  { ...valid, name: '' },
  { ...valid, name: 42 },
  { ...valid, name: 'ada' },
  { ...valid, name: 'Two\nlines' },
  { ...valid, role: '' },
  { ...valid, systemPrompt: '   ' },
  { ...valid, systemPrompt: { text: 'x' } },
  { ...valid, name: 'n'.repeat(PROPOSAL_LIMITS.name + 1) },
  { ...valid, role: 'r'.repeat(PROPOSAL_LIMITS.role + 1) },
  { ...valid, systemPrompt: 's'.repeat(PROPOSAL_LIMITS.systemPrompt + 1) }
]) {
  assert.strictEqual(toProposalDraft(raw, context), null, JSON.stringify(raw)?.slice(0, 60))
}

// An over-long reason is clipped rather than refused
assert.strictEqual(
  toProposalDraft({ ...valid, reason: 'r'.repeat(PROPOSAL_LIMITS.reason + 50) }, context).reason
    .length,
  PROPOSAL_LIMITS.reason
)

// --- What the CEO is told ---

const instruction = proposalInstruction({
  team: [
    { name: 'Ada', role: 'CEO' },
    { name: 'Bob', role: 'Engineer' }
  ],
  providers: ['anthropic', 'openai'],
  rejectedNames: ['Zed']
})
assert.ok(instruction.includes(PROPOSAL_FENCE))
assert.ok(instruction.includes('Bob (Engineer)'))
assert.ok(instruction.includes('openai'))
assert.ok(instruction.includes('Zed'))
assert.ok(/approve/i.test(instruction))
assert.ok(MAX_MEMBERS > 1)

// --- Storage ---

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
migrate(db)
assert.strictEqual(db.pragma('user_version', { simple: true }), 9)

db.prepare("INSERT INTO conversations (session_id, title, cwd) VALUES ('s', 't', '/')").run()
db.prepare("INSERT INTO companies (name, default_mode) VALUES ('Co', 'roundtable')").run()
db.prepare(
  "INSERT INTO company_members (company_id, name, role, provider, model_id, system_prompt) VALUES (1, 'Ada', 'CEO', 'anthropic', 'claude-x', 'p')"
).run()
db.prepare(
  "INSERT INTO company_messages (conversation_id, sender_type, member_id, content) VALUES (1, 'moderator', 1, 'plan')"
).run()

assert.strictEqual(hasPendingProposal(db, 1), false)
const saved = insertProposal(db, { conversationId: 1, messageId: 1, companyId: 1, draft: valid })
assert.deepStrictEqual(
  { ...saved, createdAt: null },
  {
    id: 1,
    conversationId: 1,
    messageId: 1,
    companyId: 1,
    ...valid,
    status: 'pending',
    createdMemberId: null,
    createdAt: null
  }
)
assert.strictEqual(hasPendingProposal(db, 1), true)
assert.deepStrictEqual(listProposals(db, 1), [saved])
assert.deepStrictEqual(listProposals(db, 99), [])
assert.deepStrictEqual(findProposal(db, 1), saved)
assert.strictEqual(findProposal(db, 99), null)

// Rejecting: remembered, so the CEO is told not to ask for the same one again
const rejected = resolveProposal(db, 1, 'rejected', null)
assert.strictEqual(rejected.status, 'rejected')
assert.strictEqual(hasPendingProposal(db, 1), false)
assert.deepStrictEqual(rejectedProposalNames(db, 1), ['Lena'])

// A settled proposal cannot be settled again
assert.strictEqual(resolveProposal(db, 1, 'approved', 1), null)
assert.strictEqual(findProposal(db, 1).status, 'rejected')

// Approving records which member it became; removing that member keeps the record
const second = insertProposal(db, {
  conversationId: 1,
  messageId: 1,
  companyId: 1,
  draft: { ...valid, name: 'Mia' }
})
db.prepare(
  "INSERT INTO company_members (company_id, name, role, provider, model_id, system_prompt) VALUES (1, 'Mia', 'R', 'openai', 'gpt-x', 'p')"
).run()
const approved = resolveProposal(db, second.id, 'approved', 2)
assert.strictEqual(approved.status, 'approved')
assert.strictEqual(approved.createdMemberId, 2)
db.prepare('DELETE FROM company_members WHERE id = 2').run()
assert.strictEqual(findProposal(db, second.id).createdMemberId, null)
assert.strictEqual(findProposal(db, second.id).status, 'approved')

// Proposals go with their conversation
db.prepare('DELETE FROM conversations WHERE id = 1').run()
assert.deepStrictEqual(listProposals(db, 1), [])

console.log('member proposal tests passed')
