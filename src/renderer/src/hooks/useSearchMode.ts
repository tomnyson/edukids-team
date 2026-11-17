import { useCallback, useState } from 'react'
import { isSearchMode, type SearchMode } from '@shared/search'

const STORAGE_KEY = 'search-modes'
/** Old chats are forgotten first, so the stored map cannot grow without end. */
const MAX_REMEMBERED = 200

type Modes = Readonly<Record<string, SearchMode>>

/** The stored map is hand-editable like anything in localStorage, so it is rebuilt entry by entry. */
function readModes(): Modes {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, SearchMode] =>
        isSearchMode(entry[1])
      )
    )
  } catch {
    return {}
  }
}

function writeModes(modes: Modes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modes))
  } catch (error) {
    // The choice still holds for this session; it just will not survive a restart
    console.warn('[search] could not remember the search mode:', error)
  }
}

/** Whether each chat searches the web, remembered per conversation on this machine. */
export function useSearchMode(
  conversationId: number | null
): readonly [SearchMode, (mode: SearchMode) => void] {
  const [modes, setModes] = useState<Modes>(readModes)

  const setMode = useCallback(
    (mode: SearchMode): void => {
      if (conversationId === null) return
      setModes((current) => {
        const key = String(conversationId)
        const kept = Object.entries(current)
          .filter(([id]) => id !== key)
          .slice(-(MAX_REMEMBERED - 1))
        const next: Modes =
          mode === 'off' ? Object.fromEntries(kept) : { ...Object.fromEntries(kept), [key]: mode }
        writeModes(next)
        return next
      })
    },
    [conversationId]
  )

  const mode = conversationId === null ? 'off' : (modes[String(conversationId)] ?? 'off')
  return [mode, setMode]
}
