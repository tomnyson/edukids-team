import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { AppError, EffortId, ModelId } from '@shared/types'
import { LIMITS } from '@shared/ipc'
import { getEnrichedPath, resolveClaudeBinary } from './environment'
import { NdjsonParser, interpret } from './stream-parser'

export interface RunOptions {
  readonly prompt: string
  readonly sessionId: string
  /** False for the first turn of a session, true to continue it. */
  readonly resume: boolean
  readonly cwd: string
  /** null omits --model, leaving whatever default the CLI is configured with. */
  readonly model: ModelId | null
  /** null omits --effort, same contract as the model flag. */
  readonly effort: EffortId | null
  /** Directories the CLI must be granted beyond cwd, for attached files. */
  readonly addDirs: readonly string[]
  readonly signal: AbortSignal
  readonly onDelta: (text: string) => void
  readonly onTool: (name: string) => void
}

export interface RunOutcome {
  readonly text: string
  readonly error: AppError | null
  readonly durationMs: number | null
  readonly costUsd: number | null
}

const STDERR_KEEP = 4_000

/**
 * `claude` without -p opens an interactive REPL that never exits, so print mode
 * is mandatory. The prompt travels as an argv entry with `shell: false` — never
 * interpolated into a shell string, which would be a command injection.
 */
function buildArgs(options: RunOptions): string[] {
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose'
  ]

  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)

  // Without this the CLI refuses to read attachments living outside cwd.
  for (const dir of options.addDirs) args.push('--add-dir', dir)

  args.push(options.resume ? '--resume' : '--session-id', options.sessionId, '--', options.prompt)
  return args
}

export async function runClaude(options: RunOptions): Promise<RunOutcome> {
  const binary = await resolveClaudeBinary()
  if (!binary) {
    return failure({
      code: 'BINARY_NOT_FOUND',
      message: 'Could not find the `claude` executable.',
      detail:
        'Install Claude Code, then reopen this app. If it is installed somewhere unusual, set CLAUDE_CLI_PATH to its absolute path.'
    })
  }

  const cwd = existsSync(options.cwd) ? options.cwd : homedir()
  const path = await getEnrichedPath()

  return new Promise<RunOutcome>((resolve) => {
    const child = spawn(binary, buildArgs(options), {
      cwd,
      shell: false,
      env: { ...process.env, PATH: path },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const parser = new NdjsonParser()
    const startedAt = Date.now()
    let streamed = ''
    let outcome: RunOutcome | null = null
    let stderr = ''
    let settled = false
    let timedOut = false

    const finish = (value: RunOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
      resolve(value)
    }

    /**
     * The deadline measures silence, not wall clock. A scaffolding run that
     * writes files for twenty minutes keeps emitting stream events, so it is
     * left alone; a wedged process is still killed after the idle window.
     */
    let timer = setTimeout(onIdle, LIMITS.runIdleTimeoutMs)

    function onIdle(): void {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref()
    }

    const keepAlive = (): void => {
      if (settled || timedOut) return
      clearTimeout(timer)
      timer = setTimeout(onIdle, LIMITS.runIdleTimeoutMs)
    }

    const onAbort = (): void => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref()
    }
    options.signal.addEventListener('abort', onAbort, { once: true })

    const consume = (events: readonly unknown[]): void => {
      for (const event of events) {
        const parsed = interpret(event)
        if (parsed.textDelta) {
          streamed += parsed.textDelta
          options.onDelta(parsed.textDelta)
        }
        if (parsed.toolName) options.onTool(parsed.toolName)
        if (parsed.result) {
          outcome = {
            text: parsed.result.text || streamed,
            error: parsed.result.isError
              ? { code: 'CLI_ERROR', message: parsed.result.text || 'The CLI reported an error.' }
              : null,
            durationMs: parsed.result.durationMs,
            costUsd: parsed.result.costUsd
          }
        }
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      keepAlive()
      consume(parser.push(chunk))
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      keepAlive()
      stderr = `${stderr}${chunk}`.slice(-STDERR_KEEP)
    })

    child.on('error', (error) =>
      finish(
        failure({
          code: 'SPAWN_FAILED',
          message: 'Could not start the Claude CLI.',
          detail: error.message
        })
      )
    )

    child.on('close', (code) => {
      consume(parser.flush())

      if (options.signal.aborted) {
        return finish({
          text: streamed,
          error: { code: 'CANCELLED', message: 'Stopped.' },
          durationMs: null,
          costUsd: null
        })
      }

      if (timedOut) {
        return finish({
          text: streamed,
          error: {
            code: 'TIMEOUT',
            message: `No output for ${Math.round(LIMITS.runIdleTimeoutMs / 1000)}s — the run was stopped.`
          },
          durationMs: Date.now() - startedAt,
          costUsd: null
        })
      }

      if (outcome) return finish(outcome)

      return finish({
        text: streamed,
        error: {
          code: 'CLI_ERROR',
          message:
            code === 0
              ? 'The CLI exited without returning a result.'
              : `The CLI exited with code ${code}.`,
          detail: stderr.trim() || undefined
        },
        durationMs: null,
        costUsd: null
      })
    })
  })
}

const failure = (error: AppError): RunOutcome => ({
  text: '',
  error,
  durationMs: null,
  costUsd: null
})
