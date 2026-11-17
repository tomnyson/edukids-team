import { useCallback, useState } from 'react'
import { parseOfficePrefs, type OfficePrefs } from '@renderer/lib/office/prefs'

const STORAGE_KEY = 'office-prefs'

function readPrefs(): OfficePrefs {
  try {
    return parseOfficePrefs(localStorage.getItem(STORAGE_KEY))
  } catch {
    // Storage can be unavailable; the defaults still give a working view
    return parseOfficePrefs(null)
  }
}

export type UpdateOfficePrefs = (patch: Partial<OfficePrefs>) => void

/** Chat or office, and how the office is drawn; remembered on this machine. */
export function useOfficePrefs(): readonly [OfficePrefs, UpdateOfficePrefs] {
  const [prefs, setPrefs] = useState<OfficePrefs>(readPrefs)

  const update = useCallback<UpdateOfficePrefs>((patch) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch (error) {
        // The choice still holds for this session; it just will not survive a restart
        console.warn('[office] could not remember the view settings:', error)
      }
      return next
    })
  }, [])

  return [prefs, update]
}
