/** How many skills one member can carry; each one adds to every prompt it sends. */
export const MAX_SKILLS_PER_MEMBER = 12

/** Where a skill lives: Claude Code's own folder (read-only here) or the app's library. */
export type SkillSource = 'user' | 'app'

export interface SkillRef {
  readonly source: SkillSource
  /** Folder name, which is also the skill's id within its source. */
  readonly dir: string
}

export interface ParsedSkillFile {
  readonly name: string | null
  readonly description: string | null
  readonly body: string
  /** Why the file is not usable as is, or null when it is. */
  readonly problem: string | null
}

/** What the renderer sends to create or edit an app skill. */
export interface SkillDraft {
  readonly name: string
  readonly description: string
  readonly body: string
}

/** One entry in the skills list: metadata only, so listing stays cheap. */
export interface SkillSummary {
  /** `user:<dir>` or `app:<dir>`; what members store. */
  readonly ref: string
  readonly source: SkillSource
  readonly dir: string
  /** Display name from the frontmatter, falling back to the folder name. */
  readonly name: string
  readonly description: string
  readonly problem: string | null
}

export interface SkillDetail extends SkillSummary {
  readonly body: string
  readonly folder: string
}

/** What goes into a member's system prompt for one skill. */
export interface PromptSkill {
  readonly name: string
  readonly description: string
  readonly folder: string
  readonly body: string
}
