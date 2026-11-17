import type { CompanyMember } from '../../shared/types'
import { composeMemberPrompt } from './compose'
import { loadPromptSkills, type SkillRoots } from './disk'

type PromptMember = Pick<CompanyMember, 'name' | 'systemPrompt' | 'skillRefs'>

async function withSkills<M extends PromptMember>(member: M, roots: SkillRoots): Promise<M> {
  if (member.skillRefs.length === 0) return member
  try {
    const skills = await loadPromptSkills(roots, member.skillRefs)
    return { ...member, systemPrompt: composeMemberPrompt(member.systemPrompt, skills) }
  } catch (error) {
    // A skill folder that cannot be read must not cost the user the whole turn
    const detail = error instanceof Error ? error.message : String(error)
    console.warn(`[skills] could not load skills for ${member.name}:`, detail)
    return member
  }
}

/**
 * Copies of `members` whose system prompts carry their skills, read once per run. The stored
 * members are not changed, so editing a skill takes effect on the next message.
 */
export function withSkillPrompts<M extends PromptMember>(
  members: readonly M[],
  roots: SkillRoots
): Promise<readonly M[]> {
  return Promise.all(members.map((member) => withSkills(member, roots)))
}
