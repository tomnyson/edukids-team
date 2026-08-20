import { spawn } from 'child_process'
import { stat } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { shell } from 'electron'
import type { OpenedFile, Result } from '@shared/types'
import { getEnrichedPath, isExecutable } from '../claude/environment'

/**
 * Opens a path Claude mentioned. Everything here treats that path as untrusted
 * text: it is expanded, checked for absoluteness, and confirmed to exist before
 * anything runs, and the editor is spawned with argv and `shell: false` so no
 * part of the path can be read as a command.
 */

const EDITOR = 'code'

let editorPromise: Promise<string | null> | null = null

async function locateEditor(): Promise<string | null> {
  const path = await getEnrichedPath()
  for (const dir of path.split(':')) {
    if (!dir) continue
    const candidate = join(dir, EDITOR)
    if (await isExecutable(candidate)) return candidate
  }
  return null
}

/** Absolute path to the VS Code CLI, or null when it is not installed. */
function resolveEditor(): Promise<string | null> {
  editorPromise ??= locateEditor()
  return editorPromise
}

/** Expands a leading `~`. Anything still relative is rejected by the caller. */
export function expandHome(raw: string): string {
  if (raw === '~') return homedir()
  return raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw
}

export async function openFile(rawPath: unknown, rawLine: unknown): Promise<Result<OpenedFile>> {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'No file path to open.' } }
  }

  const path = expandHome(rawPath.trim())
  if (!isAbsolute(path)) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: `Path must be absolute: ${rawPath}` }
    }
  }

  const line =
    typeof rawLine === 'number' && Number.isInteger(rawLine) && rawLine > 0 ? rawLine : null

  let isDirectory = false
  try {
    isDirectory = (await stat(path)).isDirectory()
  } catch {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `That file no longer exists: ${path}` }
    }
  }

  const editor = await resolveEditor()
  if (editor) {
    // `-g file:line` is what makes the editor land on the right line.
    const args = line && !isDirectory ? ['-g', `${path}:${line}`] : [path]
    const child = spawn(editor, args, { detached: true, stdio: 'ignore', shell: false })
    child.on('error', (error) => console.error('[files] editor failed to start:', error.message))
    child.unref()
    return { ok: true, data: { path, editor: 'code' } }
  }

  // No VS Code — hand the file to whatever macOS opens it with.
  const failure = await shell.openPath(path)
  return failure
    ? { ok: false, error: { code: 'UNKNOWN', message: `Could not open ${path}`, detail: failure } }
    : { ok: true, data: { path, editor: 'system' } }
}

/** Drops the cache so a freshly installed editor is picked up without a restart. */
export function forgetEditor(): void {
  editorPromise = null
}
