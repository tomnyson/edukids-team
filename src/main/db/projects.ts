import type { EffortId, ModelId, Project, ProjectPatch } from '@shared/types'
import { isEffortId, isModelId } from '@shared/types'
import { getDb } from './connection'

/**
 * Projects are folders the user has named. Conversations reference one, and a
 * removed project only detaches its chats — deleting work is never a side
 * effect of tidying the rail.
 */

interface ProjectRow {
  id: number
  name: string
  path: string
  default_model: string | null
  default_effort: string | null
  created_at: string
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  path: row.path,
  defaultModel: row.default_model as ModelId | null,
  defaultEffort: row.default_effort as EffortId | null,
  createdAt: row.created_at
})

const PROJECT_SELECT = `SELECT p.* FROM projects p`

export function listProjects(): readonly Project[] {
  const rows = getDb()
    .prepare(`${PROJECT_SELECT} ORDER BY p.name COLLATE NOCASE`)
    .all() as ProjectRow[]
  return rows.map(toProject)
}

export function findProject(id: number): Project | null {
  const row = getDb().prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as ProjectRow | undefined
  return row ? toProject(row) : null
}

function findProjectByPath(path: string): Project | null {
  const row = getDb().prepare(`${PROJECT_SELECT} WHERE p.path = ?`).get(path) as
    ProjectRow | undefined
  return row ? toProject(row) : null
}

/**
 * Adding a folder that is already a project returns the existing one — the
 * user asked to work in it, and two rows for one path would be a lie.
 */
export function createProject(path: string, name: string): Project {
  const existing = findProjectByPath(path)
  if (existing) return existing

  const info = getDb().prepare('INSERT INTO projects (name, path) VALUES (?, ?)').run(name, path)
  const created = findProject(Number(info.lastInsertRowid))
  if (!created) throw new Error('Project vanished immediately after insert')
  return created
}

/** Only the fields present in the patch move; anything invalid is ignored. */
export function updateProject(id: number, patch: ProjectPatch): Project | null {
  const current = findProject(id)
  if (!current) return null

  const name =
    typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : current.name
  const model =
    'defaultModel' in patch
      ? patch.defaultModel === null || isModelId(patch.defaultModel)
        ? patch.defaultModel
        : current.defaultModel
      : current.defaultModel
  const effort =
    'defaultEffort' in patch
      ? patch.defaultEffort === null || isEffortId(patch.defaultEffort)
        ? patch.defaultEffort
        : current.defaultEffort
      : current.defaultEffort

  getDb()
    .prepare('UPDATE projects SET name = ?, default_model = ?, default_effort = ? WHERE id = ?')
    .run(name, model, effort, id)
  return findProject(id)
}

/** The conversations survive: `ON DELETE SET NULL` moves them to Unfiled. */
export function deleteProject(id: number): boolean {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0
}
