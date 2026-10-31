// A full Claude model id such as claude-opus-5-5. The id reaches the CLI's argv, so only this
// shape gets through: no leading dash, no spaces, nothing the CLI could read as a flag
const CLAUDE_MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]*$/

export const isClaudeModelId = (value: unknown): value is string =>
  typeof value === 'string' && CLAUDE_MODEL_ID.test(value)
