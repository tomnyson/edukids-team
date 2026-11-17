import { randomBytes } from 'crypto'
import { constants, type Dirent, type Stats } from 'fs'
import { copyFile, lstat, mkdir, readdir, realpath, rename, rm, writeFile } from 'fs/promises'
import { basename, isAbsolute, join, relative } from 'path'
import type { Result } from '../../shared/types'
import type { SkillDetail } from '../../shared/skills'
import { fail, ok } from '../ipc/result'
import { SKILL_FILE, readSkillAt, readSkillText } from './disk'
import {
  checkSkillDraft,
  isSkillName,
  parseSkillFile,
  reviseSkillText,
  serializeSkill
} from './skill-format'

/**
 * Changes to the app's own skills library. Claude Code's `~/.claude/skills` is never written:
 * every function here takes the app root only.
 */

const IMPORT_LIMITS = { files: 200, bytes: 5 * 1024 * 1024, depth: 8 } as const
/** Not part of a skill, and a cloned repo's history would blow the file limit on its own. */
const SKIPPED = new Set(['.git', '.DS_Store'])

const invalid = (message: string): Result<never> => fail({ code: 'INVALID_INPUT', message })
const unknownSkill = (): Result<never> =>
  fail({ code: 'NOT_FOUND', message: 'That skill is no longer in the library.' })
const taken = (dir: string): Result<never> =>
  invalid(`A skill named “${dir}” already exists. Rename or delete it first.`)

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch {
    return null
  }
}

async function detailOf(appRoot: string, dir: string): Promise<Result<SkillDetail>> {
  const detail = await readSkillAt(join(appRoot, dir), 'app', dir)
  return detail ? ok(detail) : unknownSkill()
}

/** Makes the skill's folder; false when one by that name is already there. */
async function claimFolder(appRoot: string, dir: string): Promise<boolean> {
  await mkdir(appRoot, { recursive: true })
  try {
    await mkdir(join(appRoot, dir))
    return true
  } catch (error) {
    if (codeOf(error) === 'EEXIST') return false
    throw error
  }
}

export async function createSkill(appRoot: string, value: unknown): Promise<Result<SkillDetail>> {
  const check = checkSkillDraft(value)
  if (!check.ok) return invalid(check.message)
  const { draft } = check
  if (!(await claimFolder(appRoot, draft.name))) return taken(draft.name)

  const folder = join(appRoot, draft.name)
  try {
    await writeFile(join(folder, SKILL_FILE), serializeSkill(draft), { flag: 'wx' })
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    throw error
  }
  return detailOf(appRoot, draft.name)
}

/** Written to a temp file and renamed over, so a crash never leaves half a SKILL.md. */
async function writeAtomically(folder: string, text: string): Promise<void> {
  const temp = join(folder, `.${SKILL_FILE}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(temp, text, { flag: 'wx' })
    await rename(temp, join(folder, SKILL_FILE))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

export async function updateSkill(
  appRoot: string,
  dir: unknown,
  value: unknown
): Promise<Result<SkillDetail>> {
  if (!isSkillName(dir)) return invalid('Unknown skill.')
  const check = checkSkillDraft(value)
  if (!check.ok) return invalid(check.message)
  if (check.draft.name !== dir) return invalid('A skill keeps the name it was created with.')

  const folder = join(appRoot, dir)
  // lstat, not stat: never write through a link into some other folder
  const entry = await lstatOrNull(folder)
  if (entry?.isSymbolicLink()) {
    return invalid('This skill is a linked folder. Edit it where the link points.')
  }
  if (!entry?.isDirectory()) return unknownSkill()
  const current = await readSkillText(folder)
  const text =
    current !== null && 'text' in current
      ? reviseSkillText(current.text, check.draft)
      : serializeSkill(check.draft)
  await writeAtomically(folder, text)
  return detailOf(appRoot, dir)
}

interface Walk {
  readonly dirs: readonly string[]
  readonly files: readonly string[]
  readonly bytes: number
}
type WalkResult = Walk | { readonly problem: string }

async function visit(
  root: string,
  rel: string,
  entry: Dirent,
  depth: number,
  acc: Walk
): Promise<WalkResult> {
  if (entry.isSymbolicLink()) {
    return { problem: `“${rel}” is a link. Copy the real files into the folder, then import it.` }
  }
  if (entry.isDirectory()) return walkFolder(root, rel, depth + 1, acc)
  if (!entry.isFile()) return { problem: `“${rel}” is not a regular file.` }

  const { size } = await lstat(join(root, rel))
  const next = { ...acc, files: [...acc.files, rel], bytes: acc.bytes + size }
  if (next.files.length > IMPORT_LIMITS.files) {
    return { problem: `A skill can hold at most ${IMPORT_LIMITS.files} files.` }
  }
  if (next.bytes > IMPORT_LIMITS.bytes) return { problem: 'A skill can hold at most 5 MB.' }
  return next
}

/** Lists what an import would copy, refusing links, special files and oversized folders. */
async function walkFolder(
  root: string,
  rel: string,
  depth: number,
  acc: Walk
): Promise<WalkResult> {
  if (depth > IMPORT_LIMITS.depth) return { problem: 'The folder is nested too deeply.' }
  const entries = await readdir(join(root, rel), { withFileTypes: true })
  let state: WalkResult = rel === '' ? acc : { ...acc, dirs: [...acc.dirs, rel] }
  for (const entry of entries) {
    if ('problem' in state) break
    if (SKIPPED.has(entry.name)) continue
    state = await visit(root, join(rel, entry.name), entry, depth, state)
  }
  return state
}

async function copyWalk(source: string, dest: string, walk: Walk): Promise<void> {
  for (const dir of walk.dirs) await mkdir(join(dest, dir))
  for (const file of walk.files) {
    await copyFile(join(source, file), join(dest, file), constants.COPYFILE_EXCL)
  }
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Importing the library into itself, or a folder that holds it, would copy it into itself. */
async function overlapsLibrary(source: string, appRoot: string): Promise<boolean> {
  const real = await realpath(source)
  const library = await realpath(appRoot).catch(() => null)
  return library !== null && (within(library, real) || within(real, library))
}

/** The folder name to import under: the frontmatter name, else the folder's own name. */
function importName(source: string, name: string | null): string | null {
  if (isSkillName(name)) return name
  const own = basename(source)
  return isSkillName(own) ? own : null
}

type ImportPlan = { readonly dir: string; readonly walk: Walk } | { readonly problem: string }

async function planImport(source: string, appRoot: string): Promise<ImportPlan> {
  if (!(await lstatOrNull(source))?.isDirectory()) return { problem: 'Choose a folder to import.' }
  if (await overlapsLibrary(source, appRoot)) {
    return { problem: 'That folder overlaps the skills library.' }
  }
  const walk = await walkFolder(source, '', 0, { dirs: [], files: [], bytes: 0 })
  if ('problem' in walk) return walk
  if (!walk.files.includes(SKILL_FILE)) return { problem: 'The folder has no SKILL.md.' }

  const read = await readSkillText(source)
  if (read === null) return { problem: 'The folder has no SKILL.md.' }
  if ('problem' in read) return read
  const parsed = parseSkillFile(read.text)
  if (parsed.problem) return { problem: parsed.problem }

  const dir = importName(source, parsed.name)
  if (!dir) return { problem: 'Name the folder with lowercase letters, digits and hyphens.' }
  return { dir, walk }
}

/** Copies a skill folder the user picked into the library. Nothing is left behind on failure. */
export async function importSkillFolder(
  appRoot: string,
  source: unknown
): Promise<Result<SkillDetail>> {
  if (typeof source !== 'string' || !isAbsolute(source))
    return invalid('Choose a folder to import.')
  const plan = await planImport(source, appRoot)
  if ('problem' in plan) return invalid(plan.problem)
  if (!(await claimFolder(appRoot, plan.dir))) return taken(plan.dir)

  const dest = join(appRoot, plan.dir)
  try {
    await copyWalk(source, dest, plan.walk)
  } catch (error) {
    await rm(dest, { recursive: true, force: true })
    const detail = error instanceof Error ? error.message : String(error)
    return fail({ code: 'UNKNOWN', message: 'The skill could not be copied.', detail })
  }
  return detailOf(appRoot, plan.dir)
}

/** Moves an app skill to the Trash, so a mistaken delete can be undone from Finder. */
export async function removeSkillFolder(
  appRoot: string,
  dir: unknown,
  trash: (path: string) => Promise<void>
): Promise<Result<true>> {
  if (!isSkillName(dir)) return invalid('Unknown skill.')
  const folder = join(appRoot, dir)
  if (!(await lstatOrNull(folder))) return unknownSkill()
  await trash(folder)
  return ok(true)
}
