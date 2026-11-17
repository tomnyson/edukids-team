require('./support/resolve-ts.cjs')
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { listSkills, loadSkill, loadPromptSkills } = require('../src/main/skills/disk.ts')
const {
  createSkill,
  updateSkill,
  importSkillFolder,
  removeSkillFolder
} = require('../src/main/skills/store.ts')
const { parseSkillFile, serializeSkill } = require('../src/main/skills/skill-format.ts')
const { withSkillPrompts } = require('../src/main/skills/member-prompts.ts')

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
const userRoot = path.join(base, 'user')
const appRoot = path.join(base, 'app')
const roots = { user: userRoot, app: appRoot }

function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

const skillText = (name, description, body = `${name} body`) =>
  serializeSkill({ name, description, body })

async function listing() {
  // Nothing on disk yet: no roots, no skills, no error
  assert.deepStrictEqual(await listSkills(roots), [])

  put(path.join(userRoot, 'caveman', 'SKILL.md'), skillText('caveman', 'Talk short.'))
  put(path.join(userRoot, 'broken', 'SKILL.md'), '---\nname: broken\n---\nbody')
  put(path.join(userRoot, 'notes', 'README.md'), 'not a skill')
  put(path.join(userRoot, 'Bad Name', 'SKILL.md'), skillText('bad', 'Skipped.'))
  put(path.join(userRoot, 'big', 'SKILL.md'), skillText('big', 'Huge.', 'x'.repeat(300 * 1024)))
  // Claude Code users often link skills in from a repo; the link is followed when listing
  put(path.join(base, 'elsewhere', 'linked', 'SKILL.md'), skillText('linked', 'Linked in.'))
  fs.symlinkSync(path.join(base, 'elsewhere', 'linked'), path.join(userRoot, 'linked'))

  const all = await listSkills(roots)
  assert.deepStrictEqual(
    all.map((skill) => skill.ref),
    ['user:big', 'user:broken', 'user:caveman', 'user:linked']
  )
  const byRef = new Map(all.map((skill) => [skill.ref, skill]))
  assert.deepStrictEqual(byRef.get('user:caveman'), {
    ref: 'user:caveman',
    source: 'user',
    dir: 'caveman',
    name: 'caveman',
    description: 'Talk short.',
    problem: null
  })
  assert.strictEqual(byRef.get('user:broken').problem, 'SKILL.md has no description.')
  assert.strictEqual(byRef.get('user:broken').description, '')
  assert.strictEqual(byRef.get('user:big').problem, 'SKILL.md is larger than 256 KB.')
  // The list carries metadata only
  assert.strictEqual('body' in byRef.get('user:caveman'), false)
}

async function loading() {
  const detail = await loadSkill(roots, 'user:caveman')
  assert.strictEqual(detail.body, 'caveman body')
  assert.strictEqual(detail.folder, path.join(userRoot, 'caveman'))
  assert.strictEqual(await loadSkill(roots, 'app:missing'), null)
  assert.strictEqual(await loadSkill(roots, 'user:../user/caveman'), null)

  // Broken, oversized and missing skills drop out of a prompt instead of failing the turn
  const prompt = await loadPromptSkills(roots, [
    'user:linked',
    'user:broken',
    'app:gone',
    'user:big',
    'user:caveman'
  ])
  assert.deepStrictEqual(
    prompt.map((skill) => skill.name),
    ['linked', 'caveman']
  )
  assert.strictEqual(prompt[1].folder, path.join(userRoot, 'caveman'))
}

const draft = { name: 'review', description: 'Review code.', body: 'Read the diff.' }

async function creating() {
  const made = await createSkill(appRoot, draft)
  assert.strictEqual(made.ok, true)
  assert.strictEqual(made.data.ref, 'app:review')
  const onDisk = fs.readFileSync(path.join(appRoot, 'review', 'SKILL.md'), 'utf8')
  assert.deepStrictEqual(parseSkillFile(onDisk), { ...draft, problem: null })

  const again = await createSkill(appRoot, draft)
  assert.strictEqual(again.ok, false)
  assert.strictEqual(again.error.code, 'INVALID_INPUT')
  assert.match(again.error.message, /already exists/)
}

async function updating() {
  const edited = await updateSkill(appRoot, 'review', { ...draft, description: 'Review well.' })
  assert.strictEqual(edited.ok, true)
  assert.strictEqual(edited.data.description, 'Review well.')
  // Written atomically: no temp file is left beside it
  assert.deepStrictEqual(fs.readdirSync(path.join(appRoot, 'review')), ['SKILL.md'])

  // An imported skill keeps the frontmatter keys this app does not edit
  put(
    path.join(appRoot, 'tooled', 'SKILL.md'),
    '---\nname: Tooled\ndescription: Old.\nlicense: MIT\n---\n\nOld body.\n'
  )
  const tooled = await updateSkill(appRoot, 'tooled', {
    name: 'tooled',
    description: 'New.',
    body: 'New body.'
  })
  assert.strictEqual(tooled.ok, true)
  assert.strictEqual(tooled.data.name, 'Tooled')
  assert.strictEqual(tooled.data.body, 'New body.')
  assert.match(fs.readFileSync(path.join(appRoot, 'tooled', 'SKILL.md'), 'utf8'), /license: MIT/)
  fs.rmSync(path.join(appRoot, 'tooled'), { recursive: true })

  const renamed = await updateSkill(appRoot, 'review', { ...draft, name: 'other' })
  assert.strictEqual(renamed.ok, false)
  const missing = await updateSkill(appRoot, 'nope', { ...draft, name: 'nope' })
  assert.strictEqual(missing.ok, false)
  assert.strictEqual(missing.error.code, 'NOT_FOUND')

  // A linked-in folder lists like any skill but is never written through; the user is told why
  const outside = path.join(base, 'elsewhere', 'app-linked')
  put(path.join(outside, 'SKILL.md'), skillText('app-linked', 'Old.'))
  fs.symlinkSync(outside, path.join(appRoot, 'app-linked'))
  const linked = await updateSkill(appRoot, 'app-linked', { ...draft, name: 'app-linked' })
  assert.strictEqual(linked.ok, false)
  assert.strictEqual(linked.error.code, 'INVALID_INPUT')
  assert.match(linked.error.message, /link/i)
  assert.match(fs.readFileSync(path.join(outside, 'SKILL.md'), 'utf8'), /Old\./)
  fs.unlinkSync(path.join(appRoot, 'app-linked'))
}

async function importing() {
  const source = path.join(base, 'incoming', 'some-folder')
  put(path.join(source, 'SKILL.md'), skillText('imported-one', 'Came from outside.'))
  put(path.join(source, 'scripts', 'run.sh'), 'echo hi')

  const imported = await importSkillFolder(appRoot, source)
  assert.strictEqual(imported.ok, true)
  assert.strictEqual(imported.data.ref, 'app:imported-one')
  assert.strictEqual(
    fs.readFileSync(path.join(appRoot, 'imported-one', 'scripts', 'run.sh'), 'utf8'),
    'echo hi'
  )
  assert.strictEqual((await importSkillFolder(appRoot, source)).ok, false)

  // A frontmatter name that is not a valid folder name falls back to the folder's own name
  const fallback = path.join(base, 'incoming', 'fallback-dir')
  put(path.join(fallback, 'SKILL.md'), skillText('Bad Name', 'Still fine.'))
  assert.strictEqual((await importSkillFolder(appRoot, fallback)).data.ref, 'app:fallback-dir')

  // Links could point anywhere, so a folder holding one is refused and nothing is left behind
  const linky = path.join(base, 'incoming', 'linky')
  put(path.join(linky, 'SKILL.md'), skillText('linky', 'Has a link.'))
  fs.symlinkSync('/etc/hosts', path.join(linky, 'hosts'))
  const refused = await importSkillFolder(appRoot, linky)
  assert.strictEqual(refused.ok, false)
  assert.match(refused.error.message, /link/i)
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'linky')), false)

  const empty = path.join(base, 'incoming', 'empty-dir')
  fs.mkdirSync(empty, { recursive: true })
  assert.strictEqual((await importSkillFolder(appRoot, empty)).ok, false)

  const undescribed = path.join(base, 'incoming', 'undescribed')
  put(path.join(undescribed, 'SKILL.md'), '---\nname: undescribed\n---\nbody')
  const noDescription = await importSkillFolder(appRoot, undescribed)
  assert.strictEqual(noDescription.ok, false)
  assert.strictEqual(noDescription.error.message, 'SKILL.md has no description.')

  // Importing from inside the library itself makes no sense
  assert.strictEqual((await importSkillFolder(appRoot, path.join(appRoot, 'review'))).ok, false)

  const crowded = path.join(base, 'incoming', 'crowded')
  put(path.join(crowded, 'SKILL.md'), skillText('crowded', 'Too many files.'))
  for (let i = 0; i < 200; i++) put(path.join(crowded, 'files', `f${i}.txt`), 'x')
  const tooMany = await importSkillFolder(appRoot, crowded)
  assert.strictEqual(tooMany.ok, false)
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'crowded')), false)

  const listed = (await listSkills(roots)).filter((skill) => skill.source === 'app')
  assert.deepStrictEqual(
    listed.map((skill) => skill.ref),
    ['app:fallback-dir', 'app:imported-one', 'app:review']
  )
}

async function memberPrompts() {
  const ada = { id: 1, name: 'Ada', systemPrompt: 'You are Ada.', skillRefs: ['user:caveman', 'app:gone'] }
  const bob = { id: 2, name: 'Bob', systemPrompt: 'You are Bob.', skillRefs: [] }
  const [withSkill, without] = await withSkillPrompts([ada, bob], roots)

  assert.ok(withSkill.systemPrompt.startsWith('You are Ada.\n\n'))
  assert.ok(withSkill.systemPrompt.includes('<skill name="caveman"'))
  assert.ok(!withSkill.systemPrompt.includes('gone'))
  assert.strictEqual(withSkill.name, 'Ada')
  // The stored member is left as it was; a member without skills passes through untouched
  assert.strictEqual(ada.systemPrompt, 'You are Ada.')
  assert.strictEqual(without, bob)
}

async function removing() {
  const trashed = []
  const trash = async (target) => {
    trashed.push(target)
    fs.rmSync(target, { recursive: true })
  }
  const removed = await removeSkillFolder(appRoot, 'review', trash)
  assert.strictEqual(removed.ok, true)
  assert.deepStrictEqual(trashed, [path.join(appRoot, 'review')])

  assert.strictEqual((await removeSkillFolder(appRoot, 'review', trash)).error.code, 'NOT_FOUND')
  assert.strictEqual(
    (await removeSkillFolder(appRoot, '../user', trash)).error.code,
    'INVALID_INPUT'
  )
  assert.strictEqual(trashed.length, 1)
}

async function main() {
  try {
    await listing()
    await loading()
    await creating()
    await updating()
    await importing()
    await memberPrompts()
    await removing()
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
  console.log('skill-library tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
