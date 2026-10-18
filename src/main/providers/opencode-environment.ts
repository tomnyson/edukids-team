import { execFile } from 'child_process'
import { access, constants } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { getEnrichedPath } from '../claude/environment'

const execFileAsync = promisify(execFile)

const CANDIDATE_PATHS = (): readonly string[] => {
  const home = homedir()
  return [
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
    join(home, '.local', 'bin', 'opencode'),
    join(home, 'bin', 'opencode'),
    join(home, '.bun', 'bin', 'opencode'),
    join(home, '.nvm', 'versions', 'node', process.version, 'bin', 'opencode')
  ]
}

let opencodeBinaryPromise: Promise<string | null> | null = null

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function resolveOpencodeBinary(): Promise<string | null> {
  if (opencodeBinaryPromise) return opencodeBinaryPromise

  opencodeBinaryPromise = (async () => {
    // 1. Check known install locations first
    for (const candidate of CANDIDATE_PATHS()) {
      if (await isExecutable(candidate)) return candidate
    }

    // 2. Query enriched PATH with `which`
    try {
      const pathEnv = await getEnrichedPath()
      const { stdout } = await execFileAsync('which', ['opencode'], {
        env: { ...process.env, PATH: pathEnv },
        encoding: 'utf8'
      })
      const resolved = stdout.trim()
      if (resolved && (await isExecutable(resolved))) return resolved
    } catch {
      // Not found via which
    }

    return null
  })()

  return opencodeBinaryPromise
}
