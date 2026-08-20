import { createContext, useContext } from 'react'
import type { SettingsView } from '@shared/settings'
import type { Result } from '@shared/types'

export interface SettingsState {
  readonly settings: SettingsView
  /** False until the file has been read once — the UI paints defaults meanwhile. */
  readonly ready: boolean
  readonly update: (patch: Record<string, unknown>) => Promise<Result<SettingsView>>
  readonly setVoiceKey: (key: string | null) => Promise<Result<SettingsView>>
}

export const SettingsContext = createContext<SettingsState | null>(null)

export function useSettings(): SettingsState {
  const state = useContext(SettingsContext)
  if (!state) throw new Error('useSettings used outside SettingsProvider')
  return state
}
