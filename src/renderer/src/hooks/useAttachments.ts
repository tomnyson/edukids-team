import { useCallback, useState } from 'react'
import { LIMITS } from '@shared/ipc'

export interface UseAttachments {
  readonly paths: readonly string[]
  /** Set when something was dropped but could not be attached. */
  readonly notice: string | null
  add: (paths: readonly string[], skipped?: number) => void
  remove: (path: string) => void
  clear: () => void
  dismissNotice: () => void
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many)

/** Holds the files staged for the next turn, from either the sheet or a drop. */
export function useAttachments(): UseAttachments {
  const [paths, setPaths] = useState<readonly string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const add = useCallback(
    (incoming: readonly string[], skipped = 0): void => {
      const merged = [...new Set([...paths, ...incoming])]
      const kept = merged.slice(0, LIMITS.maxAttachments)
      setPaths(kept)

      const notes: string[] = []
      if (skipped > 0) {
        notes.push(
          `${skipped} ${plural(skipped, 'item has', 'items have')} no file on disk, so ${plural(skipped, 'it was', 'they were')} skipped.`
        )
      }
      if (merged.length > kept.length) {
        notes.push(`Only ${LIMITS.maxAttachments} files can be attached at once.`)
      }
      setNotice(notes.join(' ') || null)
    },
    [paths]
  )

  const remove = useCallback((path: string): void => {
    setPaths((current) => current.filter((entry) => entry !== path))
  }, [])

  const clear = useCallback((): void => setPaths([]), [])
  const dismissNotice = useCallback((): void => setNotice(null), [])

  return { paths, notice, add, remove, clear, dismissNotice }
}
