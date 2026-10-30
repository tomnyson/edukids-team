import { execFile } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { getEnrichedPath, isExecutable } from '../claude/environment'

const execFileAsync = promisify(execFile)

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

const binaryPromises = new Map<CliName, Promise<string | null>>()

async function findBinary(name: CliName): Promise<string | null> {
  // 1. Query the user's login PATH with `which`, so we run the same binary as their terminal
  //    (e.g. a current ~/.local/bin/agy rather than a stale Homebrew cask copy)
  try {
    const pathEnv = await getEnrichedPath()
    const { stdout } = await execFileAsync('which', [name], {
      env: { ...process.env, PATH: pathEnv },
      encoding: 'utf8'
    })
    const resolved = stdout.trim()
    if (resolved && (await isExecutable(resolved))) return resolved
  } catch {
    // Not found via which
  }

  // 2. Fall back to known install locations
  for (const candidate of CANDIDATE_PATHS(name)) {
    if (await isExecutable(candidate)) return candidate
  }

  return null
}

export function resolveCliBinary(name: CliName): Promise<string | null> {
  const cached = binaryPromises.get(name)
  if (cached) return cached

  const pending = findBinary(name)
  binaryPromises.set(name, pending)
  return pending
}
