import { execFile } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { getEnrichedPath, isExecutable } from '../claude/environment'
import { pickBinary } from './cli-pick'

const execFileAsync = promisify(execFile)

const HEALTH_CHECK_TIMEOUT_MS = 10000

const CANDIDATE_PATHS = (name: string): readonly string[] => {
  const home = homedir()
  return [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    join(home, '.local', 'bin', name),
    join(home, 'bin', name),
    join(home, '.bun', 'bin', name),
    join(home, '.nvm', 'versions', 'node', process.version, 'bin', name)
  ]
}

// Local CLIs this app drives (opencode, agy, codex), resolved once per app lifetime
export type CliName = 'opencode' | 'agy' | 'codex'

// npm's codex is a JS shim around a native binary that can go missing, leaving a copy that is
// executable but fails every run; one that can't print its version is skipped
const HEALTH_CHECK_ARGS: Partial<Record<CliName, readonly string[]>> = {
  codex: ['--version']
}

const binaryPromises = new Map<CliName, Promise<string | null>>()

async function runsCleanly(
  path: string,
  args: readonly string[],
  pathEnv: string
): Promise<boolean> {
  try {
    await execFileAsync(path, [...args], {
      env: { ...process.env, PATH: pathEnv },
      timeout: HEALTH_CHECK_TIMEOUT_MS
    })
    return true
  } catch {
    return false
  }
}

async function findBinary(name: CliName): Promise<string | null> {
  const pathEnv = await getEnrichedPath()

  // 1. Every match on the user's login PATH, in order, so we run the same binary as their
  //    terminal (e.g. a current ~/.local/bin/agy rather than a stale Homebrew cask copy)
  let onPath: string[] = []
  try {
    const { stdout } = await execFileAsync('which', ['-a', name], {
      env: { ...process.env, PATH: pathEnv },
      encoding: 'utf8'
    })
    onPath = stdout.split('\n')
  } catch {
    // Not found via which
  }

  // 2. Then the known install locations
  const checkArgs = HEALTH_CHECK_ARGS[name]
  return pickBinary(
    onPath,
    CANDIDATE_PATHS(name),
    async (path) =>
      (await isExecutable(path)) && (!checkArgs || (await runsCleanly(path, checkArgs, pathEnv)))
  )
}

export function resolveCliBinary(name: CliName): Promise<string | null> {
  const cached = binaryPromises.get(name)
  if (cached) return cached

  const pending = findBinary(name)
  binaryPromises.set(name, pending)
  return pending
}

/** Drops the cached path so the next call looks again, e.g. after the user reinstalls the CLI. */
export function forgetCliBinary(name: CliName): void {
  binaryPromises.delete(name)
}
