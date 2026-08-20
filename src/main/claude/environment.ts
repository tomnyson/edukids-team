import { execFile } from 'child_process'
import { access, constants } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * A GUI app launched from Finder inherits a bare `/usr/bin:/bin:/usr/sbin:/sbin`
 * PATH — none of the places a user installs the Claude CLI. We recover the real
 * PATH by asking the user's login shell, then fall back to probing known
 * install locations. Both results are cached for the app's lifetime.
 */

const SHELL_TIMEOUT_MS = 5_000

const CANDIDATE_PATHS = (): readonly string[] => {
  const home = homedir()
  return [
    join(home, '.claude', 'local', 'claude'),
    join(home, '.local', 'bin', 'claude'),
    join(home, '.bun', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude'
  ]
}

let loginPathPromise: Promise<string> | null = null
let binaryPromise: Promise<string | null> | null = null

async function readLoginPath(): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-ilc', 'printf %s "$PATH"'], {
      timeout: SHELL_TIMEOUT_MS,
      encoding: 'utf8'
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

/** The PATH to hand to spawned CLI processes: login PATH merged with our own. */
export function getEnrichedPath(): Promise<string> {
  loginPathPromise ??= readLoginPath().then((loginPath) => {
    const merged = [
      ...loginPath.split(':'),
      ...(process.env.PATH || '').split(':'),
      '/opt/homebrew/bin',
      '/usr/local/bin'
    ]
    return [...new Set(merged.filter(Boolean))].join(':')
  })
  return loginPathPromise
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function whichViaLoginShell(): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-ilc', 'command -v claude'], {
      timeout: SHELL_TIMEOUT_MS,
      encoding: 'utf8'
    })
    const path = stdout.trim().split('\n').pop()?.trim()
    return path && (await isExecutable(path)) ? path : null
  } catch {
    return null
  }
}

async function locate(): Promise<string | null> {
  const override = process.env.CLAUDE_CLI_PATH
  if (override && (await isExecutable(override))) return override

  for (const candidate of CANDIDATE_PATHS()) {
    if (await isExecutable(candidate)) return candidate
  }

  return whichViaLoginShell()
}

/** Absolute path to the `claude` binary, or null when it cannot be found. */
export function resolveClaudeBinary(): Promise<string | null> {
  binaryPromise ??= locate()
  return binaryPromise
}

/** Drops the cache so a freshly installed CLI is picked up without a restart. */
export function forgetClaudeBinary(): void {
  binaryPromise = null
}
