import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, type SettingsView } from '@shared/settings'
import { SettingsContext } from './settingsContext'

/**
 * The renderer's copy of the global settings. The main process owns the file
 * and every value in it; this only mirrors what it hands back, so a rejected
 * update simply never changes the UI.
 */

const INITIAL: SettingsView = { ...DEFAULT_SETTINGS, voiceKeyConfigured: false }

export function SettingsProvider({
  children
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView>(INITIAL)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void window.api.getSettings().then((result) => {
      if (result.ok) setSettings(result.data)
      setReady(true)
    })
  }, [])

  // The stylesheet decides light from dark by `color-scheme` alone, and this
  // attribute is the only thing that sets it.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const update = useCallback(async (patch: Record<string, unknown>) => {
    const result = await window.api.updateSettings(patch)
    if (result.ok) setSettings(result.data)
    return result
  }, [])

  const setVoiceKey = useCallback(async (key: string | null) => {
    const result = await window.api.setVoiceApiKey(key)
    if (result.ok) setSettings(result.data)
    return result
  }, [])

  const value = useMemo(
    () => ({ settings, ready, update, setVoiceKey }),
    [settings, ready, update, setVoiceKey]
  )

  // Held back for one IPC round trip so anything seeded at mount — the run
  // settings pill, the send-key hint — starts from the real values.
  return (
    <SettingsContext.Provider value={value}>{ready ? children : null}</SettingsContext.Provider>
  )
}
