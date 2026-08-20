import { useCallback, useEffect, useState } from 'react'
import type { Project, ProjectPatch } from '@shared/types'

interface UseProjects {
  readonly projects: readonly Project[]
  readonly error: string | null
  refresh: () => Promise<readonly Project[]>
  /** Opens the native folder picker; resolves to null when the user cancels. */
  add: () => Promise<Project | null>
  update: (id: number, patch: ProjectPatch) => Promise<void>
  /** Detaches the project's conversations — none of them are deleted. */
  remove: (id: number) => Promise<void>
}

/** Owns the list of project folders shown in the rail. */
export function useProjects(): UseProjects {
  const [projects, setProjects] = useState<readonly Project[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<readonly Project[]> => {
    const result = await window.api.listProjects()
    if (!result.ok) {
      setError(result.error.message)
      return []
    }
    setError(null)
    setProjects(result.data)
    return result.data
  }, [])

  const add = useCallback(async (): Promise<Project | null> => {
    const result = await window.api.addProject()
    if (!result.ok) {
      setError(result.error.message)
      return null
    }
    if (result.data) await refresh()
    return result.data
  }, [refresh])

  const update = useCallback(
    async (id: number, patch: ProjectPatch): Promise<void> => {
      const result = await window.api.updateProject(id, patch)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number): Promise<void> => {
      const result = await window.api.removeProject(id)
      if (!result.ok) setError(result.error.message)
      await refresh()
    },
    [refresh]
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const result = await window.api.listProjects()
      if (cancelled) return
      if (result.ok) setProjects(result.data)
      else setError(result.error.message)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { projects, error, refresh, add, update, remove }
}
