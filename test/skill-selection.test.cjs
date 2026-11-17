require('./support/resolve-ts.cjs')
const assert = require('assert')

const {
  filterSkills,
  toggleSkillRef,
  revertSkillRef,
  skillChips,
  toSkillName,
  finishSkillName
} = require('../src/renderer/src/lib/skills.ts')
const { MAX_SKILLS_PER_MEMBER } = require('../src/shared/skills.ts')

const summary = (source, dir, name, description, problem = null) => ({
  ref: `${source}:${dir}`,
  source,
  dir,
  name,
  description,
  problem
})

const skills = [
  summary('user', 'caveman', 'caveman', 'Talk short.'),
  summary('user', 'broken', 'broken', '', 'SKILL.md has no description.'),
  summary('app', 'review', 'Code Review', 'Read the diff before merging.')
]

// Filtering: empty query keeps everything, matching ignores case and looks at name, folder, description
assert.strictEqual(filterSkills(skills, '   '), skills)
assert.deepStrictEqual(
  filterSkills(skills, 'CODE').map((skill) => skill.ref),
  ['app:review']
)
assert.deepStrictEqual(
  filterSkills(skills, 'diff').map((skill) => skill.ref),
  ['app:review']
)
assert.deepStrictEqual(
  filterSkills(skills, 'brok').map((skill) => skill.ref),
  ['user:broken']
)
assert.deepStrictEqual(filterSkills(skills, 'nothing matches'), [])

// Toggling keeps the chosen order and never mutates the list it was given
const refs = Object.freeze(['user:caveman'])
assert.deepStrictEqual(toggleSkillRef(refs, 'app:review', MAX_SKILLS_PER_MEMBER), ['user:caveman', 'app:review'])
assert.deepStrictEqual(toggleSkillRef(refs, 'user:caveman', MAX_SKILLS_PER_MEMBER), [])
assert.deepStrictEqual(refs, ['user:caveman'])

// A full list refuses one more, but still lets one go
const full = Array.from({ length: MAX_SKILLS_PER_MEMBER }, (_, i) => `app:s${i}`)
assert.strictEqual(toggleSkillRef(full, 'app:extra', MAX_SKILLS_PER_MEMBER), full)
assert.strictEqual(toggleSkillRef(full, 'app:s0', MAX_SKILLS_PER_MEMBER).length, MAX_SKILLS_PER_MEMBER - 1)

// A failed save undoes only its own toggle; clicks made meanwhile stay as they are
const meanwhile = Object.freeze(['app:a', 'app:b', 'app:c'])
assert.deepStrictEqual(revertSkillRef(meanwhile, 'app:b', false), ['app:a', 'app:c'])
assert.deepStrictEqual(revertSkillRef(meanwhile, 'app:z', true), ['app:a', 'app:b', 'app:c', 'app:z'])
assert.strictEqual(revertSkillRef(meanwhile, 'app:z', false), meanwhile)
assert.strictEqual(revertSkillRef(meanwhile, 'app:a', true), meanwhile)
assert.deepStrictEqual(meanwhile, ['app:a', 'app:b', 'app:c'])
// Putting back a skill the save failed to remove ignores the cap: it is still attached on disk
assert.strictEqual(revertSkillRef(full, 'app:back', true).length, MAX_SKILLS_PER_MEMBER + 1)

// Chips: a deleted skill and a broken one are both shown, so the user can see why it is skipped
assert.deepStrictEqual(skillChips(['app:review', 'app:gone', 'user:broken'], skills), [
  { ref: 'app:review', label: 'Code Review', status: 'ok', note: null },
  {
    ref: 'app:gone',
    label: 'gone',
    status: 'missing',
    note: 'This skill is no longer in the library. Members skip it.'
  },
  {
    ref: 'user:broken',
    label: 'broken',
    status: 'broken',
    note: 'SKILL.md has no description.'
  }
])
// Until the list has loaded, nothing is flagged as missing
assert.strictEqual(skillChips(['app:gone'], null)[0].status, 'ok')

// Names typed in the editor become valid folder names
assert.strictEqual(toSkillName('Code Review'), 'code-review')
assert.strictEqual(toSkillName('  PR -- notes!! v2'), 'pr-notes-v2')
assert.strictEqual(toSkillName('-lead'), 'lead')
assert.strictEqual(toSkillName('Ünïcode ok'), 'unicode-ok')
assert.strictEqual(toSkillName('Đánh giá code'), 'danh-gia-code')
assert.strictEqual(toSkillName('x'.repeat(80)).length, 64)
// A trailing space or hyphen survives while typing, so "code " can still become "code-review"
assert.strictEqual(toSkillName('code '), 'code-')
assert.strictEqual(toSkillName('code-'), 'code-')
// On save the dangling hyphen goes
assert.strictEqual(finishSkillName('code - '), 'code')
assert.strictEqual(finishSkillName('!!!'), '')

console.log('skill-selection tests passed')
