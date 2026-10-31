import { spawn } from 'child_process'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { parseCodexLine } from './codex-stream'
import { getEnrichedPath } from '../claude/environment'

const CHAT_ONLY_INSTRUCTION =
  'You are answering as a plain chat model inside a meeting app. Do not use any tools, do not run commands, and do not read or write files. Reply directly in text only.'

// Codex is a coding agent: drop its shell tools and keep the sandbox read-only so a meeting turn
// can only produce text. --ignore-user-config/--ignore-rules keep the user's own Codex setup out
// of the turn (sign-in still comes from CODEX_HOME)
const CHAT_ONLY_ARGS = [
  '--skip-git-repo-check',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--sandbox',
  'read-only',
  '--disable',
  'shell_tool',
  '--disable',
  'unified_exec'
]

// npm installs a JS shim whose native binary can go missing; the shim then dies with an ENOENT
// stack trace, so keep only that line and say how to fix it. The path names the broken install:
// a plain `npm i -g` may land in a different prefix and leave this one broken
function describeFailure(stderr: string): string {
  const missing = stderr.split('\n').find((line) => line.includes('ENOENT'))
  return missing
    ? `${missing.trim()}. That Codex install is missing its native binary; reinstall it with the npm that installed it (\`npm i -g @openai/codex\`), or remove it.`
    : stderr
}

/**
 * Runs an OpenAI turn through the Codex CLI (`codex exec`), which uses the
 * user's ChatGPT sign-in instead of an API key. It runs in an empty workspace
 * with shell tools disabled, and the prompt goes in on stdin.
 */
export async function runCodex(
  binary: string,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const startedAt = Date.now()
  const pathEnv = await getEnrichedPath()
  const workspace = join(app.getPath('userData'), 'codex-workspace')
  await mkdir(workspace, { recursive: true })

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm.]`
    : request.systemPrompt

  const userContent = request.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')
  const prompt = `${CHAT_ONLY_INSTRUCTION}\n\n${systemMessage}\n\n${userContent}`

  const args = [
    'exec',
    '--json',
    ...CHAT_ONLY_ARGS,
    ...(request.modelId ? ['-m', request.modelId] : []),
    '-'
  ]

  return new Promise<LLMRunResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: workspace,
      shell: false,
      env: { ...process.env, PATH: pathEnv },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let fullContent = ''
    let tokensUsed: number | undefined
    let errorMessage: string | null = null
    let settled = false

    const cleanup = (): void => {
      if (settled) return
      settled = true
      request.signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = (): void => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1000).unref()
    }

    if (request.signal) {
      if (request.signal.aborted) {
        onAbort()
        cleanup()
        return reject(new Error('Operation cancelled'))
      }
      request.signal.addEventListener('abort', onAbort, { once: true })
    }

    const handleLine = (line: string): void => {
      const event = parseCodexLine(line)
      if (event?.kind === 'message') {
        // Codex sends each message whole; separate several messages in one turn
        const chunk = fullContent ? `\n\n${event.text}` : event.text
        fullContent += chunk
        callbacks.onContentDelta(chunk)
      } else if (event?.kind === 'usage') {
        tokensUsed = event.tokensUsed
      } else if (event?.kind === 'error') {
        errorMessage = event.message
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      lines.forEach(handleLine)
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk
    })

    // If codex exits before reading the prompt, the write fails with EPIPE; the exit code reports it
    child.stdin.on('error', () => undefined)
    child.stdin.end(prompt)

    child.on('error', (err) => {
      cleanup()
      reject(err)
    })

    child.on('close', (code) => {
      cleanup()
      handleLine(stdoutBuffer)

      const result = (text: string): LLMRunResult => ({
        text,
        reasoningText: '',
        durationMs: Date.now() - startedAt,
        tokensUsed
      })

      if (request.signal?.aborted) {
        return resolve(result(fullContent.trim()))
      }

      // Codex can report a transient stream error and still finish the reply, so only fail without one
      if (errorMessage && !fullContent.trim()) {
        return reject(new Error(`Codex CLI (codex): ${errorMessage}`))
      }

      if (code !== 0 && !fullContent.trim()) {
        const stderr = describeFailure(stderrBuffer.trim() || 'Command failed')
        return reject(new Error(`Codex CLI (codex) exited with code ${code}: ${stderr}`))
      }

      resolve(result(fullContent.trim()))
    })
  })
}
