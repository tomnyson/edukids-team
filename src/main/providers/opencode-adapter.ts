import { spawn } from 'child_process'
import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'
import { resolveOpencodeBinary } from './opencode-environment'
import { getEnrichedPath } from '../claude/environment'

export async function runOpenCode(
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const binary = await resolveOpencodeBinary()
  if (!binary) {
    throw new Error(
      'Could not find the `opencode` executable. Ensure opencode is installed on your machine (e.g., via brew or npm i -g opencode-ai).'
    )
  }

  const startedAt = Date.now()
  const pathEnv = await getEnrichedPath()

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm.]`
    : request.systemPrompt

  // Build combined prompt from messages
  const userContent = request.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
  const prompt = `${systemMessage}\n\n${userContent}`

  const args = [
    'run',
    '-m',
    request.modelId,
    '--thinking',
    prompt
  ]

  return new Promise<LLMRunResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      env: { ...process.env, PATH: pathEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let fullReasoning = ''
    let fullContent = ''
    let inThinkingSection = false
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

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        // Skip header lines like "> build · mimo-v2.6-flash-free"
        if (line.startsWith('> ') || line.trim() === '') {
          if (inThinkingSection && line.trim() === '') {
            // Empty line after thinking marks transition to response
            inThinkingSection = false
          }
          continue
        }

        if (line.startsWith('Thinking:')) {
          inThinkingSection = true
          const thoughts = line.replace(/^Thinking:\s*/, '')
          fullReasoning += thoughts + '\n'
          callbacks.onReasoningDelta?.(thoughts + '\n')
        } else if (inThinkingSection) {
          fullReasoning += line + '\n'
          callbacks.onReasoningDelta?.(line + '\n')
        } else {
          fullContent += line + '\n'
          callbacks.onContentDelta(line + '\n')
        }
      }
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
      // Flush remaining stdout
      if (stdoutBuffer.trim()) {
        if (inThinkingSection) {
          fullReasoning += stdoutBuffer
          callbacks.onReasoningDelta?.(stdoutBuffer)
        } else {
          fullContent += stdoutBuffer
          callbacks.onContentDelta(stdoutBuffer)
        }
      }

      if (request.signal?.aborted) {
        return resolve({
          text: fullContent.trim(),
          reasoningText: fullReasoning.trim(),
          durationMs: Date.now() - startedAt
        })
      }

      if (code !== 0 && !fullContent.trim()) {
        return reject(
          new Error(`OpenCode CLI exited with code ${code}: ${stderrBuffer.trim() || 'Command failed'}`)
        )
      }

      resolve({
        text: fullContent.trim(),
        reasoningText: fullReasoning.trim(),
        durationMs: Date.now() - startedAt
      })
    })
  })
}
