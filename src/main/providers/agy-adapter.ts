import { spawn } from 'child_process'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { parseAgyLine } from './agy-stream'
import { getEnrichedPath } from '../claude/environment'

// agy is an agent: bound each turn so a pending tool permission prompt cannot hang the run
const PRINT_TIMEOUT = '300s'

// Without this, open-ended prompts make agy inspect its workspace with tools; headless mode
// denies them and the turn ends with an empty reply
const CHAT_ONLY_INSTRUCTION =
  'You are answering as a plain chat model inside a meeting app. Do not use any tools, do not run commands, and do not read or write files. Reply directly in text only.'

/**
 * Runs a Gemini turn through the Antigravity CLI (`agy`), which uses the user's
 * Google sign-in instead of an API key. Because agy can call tools, it runs
 * sandboxed in an empty workspace with slash commands disabled.
 */
export async function runAgy(
  binary: string,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const startedAt = Date.now()
  const pathEnv = await getEnrichedPath()
  const workspace = join(app.getPath('userData'), 'agy-workspace')
  await mkdir(workspace, { recursive: true })

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm.]`
    : request.systemPrompt

  // Build combined prompt from messages
  const userContent = request.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')
  const prompt = `${CHAT_ONLY_INSTRUCTION}\n\n${systemMessage}\n\n${userContent}`

  const args = [
    '-p',
    prompt,
    ...(request.modelId ? ['--model', request.modelId] : []),
    '--output-format',
    'stream-json',
    '--print-timeout',
    PRINT_TIMEOUT,
    '--disable-slash-commands',
    '--sandbox'
  ]

  return new Promise<LLMRunResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: workspace,
      shell: false,
      env: { ...process.env, PATH: pathEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let fullContent = ''
    let finalResponse = ''
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
      const event = parseAgyLine(line)
      if (event?.kind === 'delta') {
        fullContent += event.text
        callbacks.onContentDelta(event.text)
      } else if (event?.kind === 'result') {
        finalResponse = event.response
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

      if (errorMessage) {
        return reject(new Error(`Antigravity CLI (agy): ${errorMessage}`))
      }

      // No text deltas arrived: use the final result's full response
      if (!fullContent.trim() && finalResponse.trim()) {
        fullContent = finalResponse
        callbacks.onContentDelta(finalResponse)
      }

      if (code !== 0 && !fullContent.trim()) {
        return reject(
          new Error(
            `Antigravity CLI (agy) exited with code ${code}: ${stderrBuffer.trim() || 'Command failed'}`
          )
        )
      }

      resolve(result(fullContent.trim()))
    })
  })
}
