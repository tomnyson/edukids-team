import { lstat, readdir, rm } from 'fs/promises'
import { join } from 'path'

/** Prefix of the private folder each local transcription writes its clip into. */
export const VOICE_TEMP_PREFIX = 'claude-gui-voice-'

/**
 * A quit or crash can stop a transcription or download before its own cleanup runs. Entries
 * younger than this may belong to a second window still at work, so they are left alone.
 */
export const STALE_AFTER_MS = 30 * 60 * 1000

async function removeIfStale(path: string, cutoff: number): Promise<boolean> {
  try {
    if ((await lstat(path)).mtimeMs >= cutoff) return false
    await rm(path, { recursive: true, force: true })
    return true
  } catch {
    // Best effort: an entry another process removed or still holds is tried again next launch
    return false
  }
}

/**
 * Removes entries of `dir` whose names `matches` and that were last changed more than
 * `olderThanMs` before `now`. Resolves to how many went; a missing folder sweeps nothing.
 */
export async function sweepStale(
  dir: string,
  matches: (name: string) => boolean,
  olderThanMs: number,
  now: number = Date.now()
): Promise<number> {
  let names: readonly string[]
  try {
    names = await readdir(dir)
  } catch {
    return 0
  }
  const cutoff = now - olderThanMs
  const removed = await Promise.all(
    names.filter(matches).map((name) => removeIfStale(join(dir, name), cutoff))
  )
  return removed.filter(Boolean).length
}
