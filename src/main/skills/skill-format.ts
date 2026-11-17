import { isMap, parse, parseDocument, stringify } from 'yaml'
import {
  MAX_SKILLS_PER_MEMBER,
  type ParsedSkillFile,
  type SkillDraft,
  type SkillRef,
  type SkillSource
} from '../../shared/skills'

/**
 * A skill's folder name is its identity: lowercase, digits and hyphens, the same shape Claude
 * Code uses. Keeping it this narrow means a ref can never name a path outside its root.
 */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export { MAX_SKILLS_PER_MEMBER }
export const SKILL_FILE_MAX_BYTES = 256 * 1024
export const SKILL_DESCRIPTION_MAX = 1024
export const SKILL_BODY_MAX = 64 * 1024

const SOURCES: readonly SkillSource[] = ['user', 'app']

export function isSkillName(value: unknown): value is string {
  return typeof value === 'string' && SKILL_NAME.test(value)
}

export function skillRef(source: SkillSource, dir: string): string {
  return `${source}:${dir}`
}

export function parseSkillRef(value: unknown): SkillRef | null {
  if (typeof value !== 'string') return null
  const colon = value.indexOf(':')
  if (colon <= 0) return null
  const source = value.slice(0, colon) as SkillSource
  const dir = value.slice(colon + 1)
  if (!SOURCES.includes(source) || !isSkillName(dir)) return null
  return { source, dir }
}

export type RefsCheck =
  | { readonly ok: true; readonly refs: readonly string[] }
  | { readonly ok: false; readonly message: string }

/** A member's skill list from the renderer: every ref valid, duplicates dropped, order kept. */
export function checkSkillRefs(value: unknown): RefsCheck {
  if (!Array.isArray(value)) return { ok: false, message: 'Skills must be a list.' }
  if (value.some((ref) => parseSkillRef(ref) === null)) {
    return { ok: false, message: 'A skill reference is not valid.' }
  }
  const refs = [...new Set(value as string[])]
  if (refs.length > MAX_SKILLS_PER_MEMBER) {
    return { ok: false, message: `A member can have at most ${MAX_SKILLS_PER_MEMBER} skills.` }
  }
  return { ok: true, refs }
}

const FENCE_OPEN = /^---[ \t]*\n/
const FENCE_CLOSE = /\n---[ \t]*(?:\n|$)/

function normalize(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseFrontmatter(yaml: string): Record<string, unknown> | string {
  let data: unknown
  try {
    // failsafe: every scalar stays a string; no aliases, so nothing can expand on us
    data = parse(yaml, { schema: 'failsafe', maxAliasCount: 0, prettyErrors: false })
  } catch {
    return 'The frontmatter is not valid YAML.'
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return 'The frontmatter is not a mapping.'
  }
  return data as Record<string, unknown>
}

type Split =
  | { readonly yaml: string; readonly body: string }
  | { readonly problem: string; readonly body: string }

/** Separates the `---` fenced frontmatter from the body. */
function splitFrontmatter(raw: string): Split {
  const text = normalize(raw)
  const open = FENCE_OPEN.exec(text)
  if (!open) return { problem: 'SKILL.md has no frontmatter.', body: text.trim() }
  const rest = text.slice(open[0].length)
  const close = FENCE_CLOSE.exec(`\n${rest}`)
  if (!close) return { problem: 'The frontmatter is never closed.', body: '' }
  return {
    yaml: rest.slice(0, Math.max(0, close.index - 1)),
    body: rest.slice(close.index - 1 + close[0].length).trim()
  }
}

/**
 * Reads a SKILL.md. Never throws: a broken file still lists, with `problem` saying why, so the
 * user can see and fix it instead of it silently vanishing.
 */
export function parseSkillFile(raw: string): ParsedSkillFile {
  const split = splitFrontmatter(raw)
  const { body } = split
  if ('problem' in split) return { name: null, description: null, body, problem: split.problem }
  const data = parseFrontmatter(split.yaml)
  if (typeof data === 'string') return { name: null, description: null, body, problem: data }

  const name = asText(data.name)
  const description = asText(data.description)
  return {
    name,
    description,
    body,
    problem: description === null ? 'SKILL.md has no description.' : null
  }
}

export function serializeSkill(draft: SkillDraft): string {
  const frontmatter = stringify(
    { name: draft.name, description: draft.description },
    { lineWidth: 0 }
  )
  return `---\n${frontmatter}---\n\n${draft.body}\n`
}

/**
 * An edited skill written over its existing file. Keys this app does not edit (license,
 * allowed-tools, ...), comments and the display name are kept; a file with nothing usable to
 * keep is written fresh.
 */
export function reviseSkillText(raw: string, draft: SkillDraft): string {
  const split = splitFrontmatter(raw)
  if ('problem' in split) return serializeSkill(draft)
  const doc = parseDocument(split.yaml)
  if (doc.errors.length > 0 || !isMap(doc.contents)) return serializeSkill(draft)

  doc.set('description', draft.description)
  if (!doc.has('name')) doc.set('name', draft.name)
  return `---\n${doc.toString({ lineWidth: 0 })}---\n\n${draft.body}\n`
}

export type DraftCheck =
  | { readonly ok: true; readonly draft: SkillDraft }
  | { readonly ok: false; readonly message: string }

/** A new or edited skill from the renderer, checked before anything touches the disk. */
export function checkSkillDraft(value: unknown): DraftCheck {
  if (value === null || typeof value !== 'object') {
    return { ok: false, message: 'The skill is missing.' }
  }
  const { name, description, body } = value as Record<string, unknown>
  if (!isSkillName(name)) {
    return {
      ok: false,
      message: 'Names use lowercase letters, digits and hyphens, up to 64 characters.'
    }
  }
  const text = typeof description === 'string' ? description.trim() : ''
  if (text === '') return { ok: false, message: 'Add a description of when to use the skill.' }
  if (text.length > SKILL_DESCRIPTION_MAX) {
    return { ok: false, message: `Keep the description under ${SKILL_DESCRIPTION_MAX} characters.` }
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return { ok: false, message: 'The skill needs instructions.' }
  }
  if (body.length > SKILL_BODY_MAX) {
    return { ok: false, message: 'The instructions are longer than 64 KB.' }
  }
  return { ok: true, draft: { name, description: text, body } }
}
