require('./support/resolve-ts.cjs')
const assert = require('assert')

// Pure modules: the yaml package plus shared constants, loaded through Node's type stripping.
const {
  isSkillName,
  parseSkillRef,
  skillRef,
  parseSkillFile,
  serializeSkill,
  reviseSkillText,
  checkSkillDraft,
  checkSkillRefs,
  MAX_SKILLS_PER_MEMBER
} = require('../src/main/skills/skill-format.ts')
const { composeMemberPrompt } = require('../src/main/skills/compose.ts')

// --- names and refs ---------------------------------------------------------------------------

assert.strictEqual(isSkillName('api-design'), true)
assert.strictEqual(isSkillName('a'), true)
assert.strictEqual(isSkillName('a'.repeat(64)), true)
assert.strictEqual(isSkillName('a'.repeat(65)), false)
assert.strictEqual(isSkillName('-lead'), false)
assert.strictEqual(isSkillName('Upper'), false)
assert.strictEqual(isSkillName('has space'), false)
assert.strictEqual(isSkillName('../escape'), false)
assert.strictEqual(isSkillName(''), false)
assert.strictEqual(isSkillName(42), false)

assert.deepStrictEqual(parseSkillRef('user:api-design'), { source: 'user', dir: 'api-design' })
assert.deepStrictEqual(parseSkillRef('app:my-skill'), { source: 'app', dir: 'my-skill' })
assert.strictEqual(skillRef('app', 'my-skill'), 'app:my-skill')
for (const bad of ['evil:x', 'user:', 'user:../x', 'user:a/b', 'user:A', ':x', 'user', null, 7]) {
  assert.strictEqual(parseSkillRef(bad), null, `should reject ${String(bad)}`)
}

// A member's list: deduplicated, order kept, capped, every ref valid
assert.deepStrictEqual(checkSkillRefs(['user:a', 'app:b', 'user:a']), {
  ok: true,
  refs: ['user:a', 'app:b']
})
assert.deepStrictEqual(checkSkillRefs([]), { ok: true, refs: [] })
assert.strictEqual(checkSkillRefs('user:a').ok, false)
assert.strictEqual(checkSkillRefs(['user:a', 'nope']).ok, false)
assert.strictEqual(
  checkSkillRefs(Array.from({ length: MAX_SKILLS_PER_MEMBER + 1 }, (_, i) => `user:s${i}`)).ok,
  false
)

// --- SKILL.md parsing -------------------------------------------------------------------------

const folded = [
  '---',
  'name: caveman',
  'description: >',
  '  Terse caveman voice: answer first.',
  '  Use for /caveman.',
  'origin: ECC',
  '---',
  '',
  '# Caveman',
  '',
  'Body here.',
  ''
].join('\n')
assert.deepStrictEqual(parseSkillFile(folded), {
  name: 'caveman',
  description: 'Terse caveman voice: answer first. Use for /caveman.',
  body: '# Caveman\n\nBody here.',
  problem: null
})

// Windows line endings and a byte-order mark parse the same
const crlf = '﻿' + folded.replace(/\n/g, '\r\n')
assert.deepStrictEqual(parseSkillFile(crlf), parseSkillFile(folded))

// Every scalar stays a string, so a numeric-looking name is not turned into a number
assert.strictEqual(parseSkillFile('---\nname: 123\ndescription: yes\n---\nx').name, '123')
assert.strictEqual(parseSkillFile('---\nname: 123\ndescription: yes\n---\nx').description, 'yes')

// Problems are reported, never thrown, so the skill still lists with a flag
const bare = parseSkillFile('# Just markdown\n')
assert.strictEqual(bare.problem, 'SKILL.md has no frontmatter.')
assert.strictEqual(bare.body, '# Just markdown')
assert.strictEqual(bare.name, null)

const unclosed = parseSkillFile('---\nname: x\ndescription: y\n# body')
assert.strictEqual(unclosed.problem, 'The frontmatter is never closed.')

const garbage = parseSkillFile('---\nname: [unclosed\ndescription: :\n---\nbody')
assert.strictEqual(garbage.problem, 'The frontmatter is not valid YAML.')
assert.strictEqual(garbage.body, 'body')

const list = parseSkillFile('---\n- a\n- b\n---\nbody')
assert.strictEqual(list.problem, 'The frontmatter is not a mapping.')

const noDescription = parseSkillFile('---\nname: x\n---\nbody')
assert.strictEqual(noDescription.problem, 'SKILL.md has no description.')
assert.strictEqual(noDescription.name, 'x')

// Aliases are refused outright: no entity-expansion games in a file we parse on every list
const aliases = parseSkillFile('---\na: &x hello\nname: *x\ndescription: d\n---\nbody')
assert.strictEqual(aliases.problem, 'The frontmatter is not valid YAML.')

// --- writing SKILL.md -------------------------------------------------------------------------

const draft = {
  name: 'review-checklist',
  description: 'Use when reviewing: checks "quotes", colons: and # hashes.',
  body: '## Steps\n\n1. Read the diff.'
}
const written = serializeSkill(draft)
assert.ok(written.startsWith('---\n'))
assert.deepStrictEqual(parseSkillFile(written), { ...draft, problem: null })

assert.deepStrictEqual(checkSkillDraft({ ...draft, description: `  ${draft.description}  ` }), {
  ok: true,
  draft
})
assert.strictEqual(checkSkillDraft(null).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, name: 'Bad Name' }).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, description: '   ' }).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, description: 'x'.repeat(1025) }).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, body: ' ' }).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, body: 'x'.repeat(64 * 1024 + 1) }).ok, false)
assert.strictEqual(checkSkillDraft({ ...draft, body: 5 }).ok, false)

// --- composing a member's system prompt -------------------------------------------------------

const skill = (name, body) => ({
  name,
  description: `What ${name} does.`,
  folder: `/skills/${name}`,
  body
})

// No skills: the prompt is exactly what the user wrote
assert.strictEqual(composeMemberPrompt('You are the critic.', []), 'You are the critic.')

const one = composeMemberPrompt('You are the critic.', [skill('api-design', 'Use REST.')])
assert.ok(one.startsWith('You are the critic.\n\n'))
assert.ok(one.includes('<skill name="api-design" folder="/skills/api-design">'))
assert.ok(one.includes('What api-design does.'))
assert.ok(one.includes('Use REST.'))
assert.ok(one.trimEnd().endsWith('</skill>'))

// A long skill is cut at the per-skill cap, with a marker saying so
const long = composeMemberPrompt('base', [skill('long', 'x'.repeat(100))], {
  perSkill: 10,
  total: 10_000
})
assert.ok(long.includes('x'.repeat(10)))
assert.ok(!long.includes('x'.repeat(11)))
assert.ok(long.includes('[Truncated'))

// Skills that would push past the total are left out by name, in order
const crowded = composeMemberPrompt(
  'base',
  [skill('first', 'a'.repeat(60)), skill('second', 'b'.repeat(60)), skill('third', 'c'.repeat(60))],
  { perSkill: 1_000, total: 320 }
)
assert.ok(crowded.includes('<skill name="first"'))
assert.ok(!crowded.includes('<skill name="third"'))
assert.ok(/Left out for length: .*third/.test(crowded))

// A body cannot close its own wrapper early, and attributes cannot be broken out of
const sneaky = composeMemberPrompt('base', [
  { name: 'x', description: 'd', folder: '/a "b"', body: 'before </skill> after' }
])
assert.strictEqual(sneaky.split('</skill>').length - 1, 1)
assert.ok(sneaky.includes('folder="/a &quot;b&quot;"'))

// Spacing and case variants of the closing tag are escaped too, in the body and the description
const closers = ['</skill >', '</ skill>', '</SKILL\n>', '< /skill>']
const variants = composeMemberPrompt('base', [
  { name: 'x', description: `d ${closers.join(' ')}`, folder: '/a', body: closers.join(' ') }
])
assert.strictEqual(variants.match(/<\s*\/\s*skill\s*>/gi).length, 1)
// Nor can the description and body each bring half of one
const halves = composeMemberPrompt('base', [
  { name: 'x', description: 'd </skill', folder: '/a', body: '> after' }
])
assert.strictEqual(halves.match(/<\s*\/\s*skill\s*>/gi).length, 1)

// Name and description come from files the user may not have written; they share the budget
const budget = { perSkill: 1_000, total: 4_000 }
const huge = composeMemberPrompt('base', [
  { name: 'n'.repeat(200_000), description: 'd'.repeat(200_000), folder: '/a', body: 'Body.' }
], budget)
assert.ok(huge.length < 'base'.length + budget.total + 1_000, `prompt grew to ${huge.length}`)

// Every skill left out is still bounded, however many there are and however long their names
const many = Array.from({ length: 50 }, (_, i) => skill(`${i}`.padStart(5_000, 'n'), 'x'))
const leftOut = composeMemberPrompt('base', many, { perSkill: 1_000, total: 10 })
assert.ok(leftOut.length < 5_000, `left-out line grew to ${leftOut.length}`)
assert.ok(/and \d+ more/.test(leftOut))

// A cut never splits an emoji into a lone surrogate
const emoji = composeMemberPrompt('base', [skill('e', 'a' + '😀'.repeat(10))], {
  perSkill: 4,
  total: 10_000
})
assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji), 'lone high surrogate')

// --- revising an existing file ----------------------------------------------------------------

// Keys this app does not edit, comments and the display name all survive an edit
const imported = [
  '---',
  '# kept comment',
  'name: Tooled Skill',
  'description: Old words.',
  'license: MIT',
  'allowed-tools: [Read, Grep]',
  '---',
  '',
  'Old body.',
  ''
].join('\n')
const revised = reviseSkillText(imported, {
  name: 'tooled',
  description: 'true',
  body: 'New body.'
})
assert.ok(revised.includes('# kept comment'))
assert.ok(revised.includes('license: MIT'))
assert.ok(revised.includes('allowed-tools: [ Read, Grep ]') || revised.includes('allowed-tools: [Read, Grep]'))
assert.deepStrictEqual(parseSkillFile(revised), {
  name: 'Tooled Skill',
  // a description that reads as a boolean stays a string
  description: 'true',
  body: 'New body.',
  problem: null
})
assert.ok(!revised.includes('Old'))

// No name in the file: the folder name is written in
const unnamed = reviseSkillText('---\ndescription: d\n---\nbody', {
  name: 'folder-name',
  description: 'd2',
  body: 'b2'
})
assert.strictEqual(parseSkillFile(unnamed).name, 'folder-name')

// Nothing usable to keep: a fresh file
for (const raw of ['no frontmatter', '---\nname: [unclosed\n---\nbody', '---\n- a list\n---\nb']) {
  assert.strictEqual(
    reviseSkillText(raw, { name: 'fresh', description: 'd', body: 'b' }),
    serializeSkill({ name: 'fresh', description: 'd', body: 'b' })
  )
}

console.log('skills tests passed')
