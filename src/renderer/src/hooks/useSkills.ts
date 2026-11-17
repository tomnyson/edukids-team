import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@shared/types'
import type { SkillDetail, SkillDraft, SkillSummary } from '@shared/skills'

export interface Skills {
  /** Null until the first list returns. */
  readonly skills: readonly SkillSummary[] | null
  /** Why the list could not be read, or null. */
  readonly error: string | null
  readonly refresh: () => Promise<void>
  readonly load: (ref: string) => Promise<Result<SkillDetail>>
  readonly create: (draft: SkillDraft) => Promise<Result<SkillDetail>>
  readonly update: (dir: string, draft: SkillDraft) => Promise<Result<SkillDetail>>
  /** Opens the folder picker; a cancelled pick comes back as a CANCELLED failure. */
  readonly importFolder: () => Promise<Result<SkillDetail>>
  readonly remove: (dir: string) => Promise<Result<true>>
  readonly reveal: (ref: string) => Promise<Result<true>>
}

/**
 * Both skill libraries, re-read after every change. The main process owns the files; this
 * only holds the last list it returned. Callers show a failed change's message themselves.
 */
export function useSkills(): Skills {
  const [skills, setSkills] = useState<readonly SkillSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((result: Result<readonly SkillSummary[]>): void => {
    if (result.ok) {
      setSkills(result.data)
      setError(null)
    } else {
      setError(result.error.message)
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    apply(await window.api.skills.list())
  }, [apply])

  useEffect(() => {
    let live = true
    void window.api.skills.list().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply])

  const thenRefresh = useCallback(
    async <T>(pending: Promise<Result<T>>): Promise<Result<T>> => {
      const result = await pending
      if (result.ok) await refresh()
      return result
    },
    [refresh]
  )

  const load = useCallback((ref: string) => window.api.skills.get(ref), [])
  const create = useCallback(
    (draft: SkillDraft) => thenRefresh(window.api.skills.create(draft)),
    [thenRefresh]
  )
  const update = useCallback(
    (dir: string, draft: SkillDraft) => thenRefresh(window.api.skills.update(dir, draft)),
    [thenRefresh]
  )
  const importFolder = useCallback(
    () => thenRefresh(window.api.skills.importFolder()),
    [thenRefresh]
  )
  const remove = useCallback(
    (dir: string) => thenRefresh(window.api.skills.delete(dir)),
    [thenRefresh]
  )
  const reveal = useCallback((ref: string) => window.api.skills.reveal(ref), [])

  return { skills, error, refresh, load, create, update, importFolder, remove, reveal }
}
