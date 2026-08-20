import { existsSync, statSync } from 'fs'
import { dirname, isAbsolute } from 'path'
import { LIMITS } from '@shared/ipc'
import type { AppError } from '@shared/types'

export type AttachmentCheck =
  | { readonly ok: true; readonly paths: readonly string[] }
  | { readonly ok: false; readonly error: AppError }

const invalid = (message: string): AttachmentCheck => ({
  ok: false,
  error: { code: 'INVALID_INPUT', message }
})

/**
 * Attachment paths become argv entries and grant the CLI directory access, so
 * every one is checked here rather than trusted from the renderer.
 */
export function validateAttachments(value: unknown): AttachmentCheck {
  if (value === undefined || value === null) return { ok: true, paths: [] }
  if (!Array.isArray(value)) return invalid('Attachments must be a list of file paths.')

  if (value.length > LIMITS.maxAttachments) {
    return invalid(`Too many files attached (limit ${LIMITS.maxAttachments}).`)
  }

  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      return invalid('Every attachment must be a file path.')
    }
    if (!isAbsolute(entry)) return invalid(`Attachment path must be absolute: ${entry}`)
    if (!existsSync(entry)) return invalid(`That file no longer exists: ${entry}`)
    if (statSync(entry).isDirectory()) return invalid(`Attach files, not folders: ${entry}`)
    seen.add(entry)
  }

  return { ok: true, paths: [...seen] }
}

export interface ComposedPrompt {
  readonly prompt: string
  readonly addDirs: readonly string[]
}

/**
 * `@path` mentions make the CLI read the files itself, so nothing has to be
 * slurped into the prompt. Spaces need no quoting: the whole prompt is a single
 * argv entry, never a shell string.
 */
export function composePrompt(prompt: string, paths: readonly string[]): ComposedPrompt {
  if (paths.length === 0) return { prompt, addDirs: [] }

  const mentions = paths.map((path) => `@${path}`).join(' ')
  return {
    prompt: `${mentions}\n\n${prompt}`,
    addDirs: [...new Set(paths.map((path) => dirname(path)))]
  }
}
