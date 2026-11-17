import { open, readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { PromptSkill, SkillDetail, SkillSource, SkillSummary } from '../../shared/skills'
import {
  SKILL_FILE_MAX_BYTES,
  isSkillName,
  parseSkillFile,
  parseSkillRef,
  skillRef
} from './skill-format'

/** Where each source's skills live; injected so tests can point at temp folders. */
export interface SkillRoots {
  readonly user: string
  readonly app: string
}

export const SKILL_FILE = 'SKILL.md'
const TOO_BIG = `SKILL.md is larger than ${SKILL_FILE_MAX_BYTES / 1024} KB.`

export type FileRead = { readonly text: string } | { readonly problem: string } | null

/** Reads SKILL.md up to the size cap. Null when there is no such file. */
export async function readSkillText(folder: string): Promise<FileRead> {
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(join(folder, SKILL_FILE), 'r')
  } catch {
    return null
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) return null
    if (info.size > SKILL_FILE_MAX_BYTES) return { problem: TOO_BIG }
    return { text: await handle.readFile('utf8') }
  } finally {
    await handle.close()
  }
}

/** Follows links: Claude Code users often link skill folders in from a repo. */
async function isFolder(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** The skill in `folder`, or null when it holds no SKILL.md. */
export async function readSkillAt(
  folder: string,
  source: SkillSource,
  dir: string
): Promise<SkillDetail | null> {
  if (!(await isFolder(folder))) return null
  const read = await readSkillText(folder)
  if (read === null) return null

  const parsed =
    'text' in read
      ? parseSkillFile(read.text)
      : { name: null, description: null, body: '', problem: read.problem }
  return {
    ref: skillRef(source, dir),
    source,
    dir,
    name: parsed.name ?? dir,
    description: parsed.description ?? '',
    problem: parsed.problem,
    body: parsed.body,
    folder
  }
}

function toSummary(detail: SkillDetail): SkillSummary {
  const { ref, source, dir, name, description, problem } = detail
  return { ref, source, dir, name, description, problem }
}

async function listSource(
  roots: SkillRoots,
  source: SkillSource
): Promise<readonly SkillSummary[]> {
  let names: readonly string[]
  try {
    names = await readdir(roots[source])
  } catch {
    return []
  }
  const dirs = names.filter(isSkillName).sort()
  const details = await Promise.all(
    dirs.map((dir) => readSkillAt(join(roots[source], dir), source, dir))
  )
  return details.filter((detail): detail is SkillDetail => detail !== null).map(toSummary)
}

/** Every skill in both roots, Claude Code's first. Folders without SKILL.md are skipped. */
export async function listSkills(roots: SkillRoots): Promise<readonly SkillSummary[]> {
  const [user, app] = await Promise.all([listSource(roots, 'user'), listSource(roots, 'app')])
  return [...user, ...app]
}

export async function loadSkill(roots: SkillRoots, ref: unknown): Promise<SkillDetail | null> {
  const parsed = parseSkillRef(ref)
  return parsed
    ? readSkillAt(join(roots[parsed.source], parsed.dir), parsed.source, parsed.dir)
    : null
}

/**
 * The usable skills among `refs`, in order. A skill that was deleted, broken or grew too big
 * since it was attached is skipped: a member keeps working without it.
 */
export async function loadPromptSkills(
  roots: SkillRoots,
  refs: readonly string[]
): Promise<readonly PromptSkill[]> {
  const details = await Promise.all(refs.map((ref) => loadSkill(roots, ref)))
  return details
    .filter((detail): detail is SkillDetail => detail !== null && detail.problem === null)
    .map(({ name, description, folder, body }) => ({ name, description, folder, body }))
}
