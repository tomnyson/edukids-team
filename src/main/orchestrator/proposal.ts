import type { CompanyMember, ProviderId } from '@shared/types'

/** The code-fence label the CEO puts a proposal in. */
export const PROPOSAL_FENCE = 'agent-proposal'

/** Shown when a reply was nothing but the proposal block. */
const PROPOSAL_ONLY_REPLY = 'I am proposing a new team member for this task.'

const BLOCK = new RegExp('```' + PROPOSAL_FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'g')

export interface ExtractedProposal {
  /** The reply without any proposal block: what the user reads and later turns are sent. */
  readonly content: string
  /** The first block's parsed JSON, still untrusted; null when there is none or it is not JSON. */
  readonly raw: unknown
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Models get JSON wrong often enough; a bad block is simply no proposal
    return null
  }
}

/** Splits a CEO reply into its text and the proposal it carried, if any. */
export function extractProposal(text: string): ExtractedProposal {
  const blocks = [...text.matchAll(BLOCK)]
  if (blocks.length === 0) return { content: text, raw: null }

  const content = text
    .replace(BLOCK, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { content: content || PROPOSAL_ONLY_REPLY, raw: parseJson(blocks[0][1]) }
}

export interface ProposalInstructionInput {
  readonly team: readonly Pick<CompanyMember, 'name' | 'role'>[]
  readonly providers: readonly ProviderId[]
  /** Names the user already turned down in this meeting. */
  readonly rejectedNames: readonly string[]
}

/** Appended to the CEO's framing or planning instruction. */
export function proposalInstruction(input: ProposalInstructionInput): string {
  const team = input.team.map((member) => `${member.name} (${member.role})`).join(', ')
  const rejected =
    input.rejectedNames.length > 0
      ? ` The user already declined these proposals, so do not repeat them: ${input.rejectedNames.join(', ')}.`
      : ''

  return [
    `Team check: the current team is ${team}.`,
    'Only if this task clearly needs an expertise that nobody on the team has, you may propose ONE new member.',
    'Most tasks need none, and each member adds cost to every prompt, so propose nothing unless it is really needed.',
    `To propose, end your reply with one fenced block labelled ${PROPOSAL_FENCE} holding a JSON object:`,
    '```' + PROPOSAL_FENCE,
    '{"name": "short unique name", "role": "job title", "systemPrompt": "the instructions this member works by", "provider": "optional", "modelId": "optional", "reason": "one sentence on why the task needs them"}',
    '```',
    `"provider" may only be one of: ${input.providers.join(', ')}. Leave "provider" and "modelId" out to use your own model.`,
    `The user must approve the proposal before the member exists, and the member joins from the next prompt, so carry on with the current team now.${rejected}`
  ].join('\n')
}
