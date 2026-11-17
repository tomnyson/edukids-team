import { useCallback, useEffect, useState } from 'react'
import type { VoiceModelId } from '@shared/settings'
import type { VoiceDownloadProgress, VoiceStatus } from '@shared/voice'

type ProgressMap = Readonly<Partial<Record<VoiceModelId, VoiceDownloadProgress>>>

export interface VoiceModels {
  /** Null until the first check returns. */
  readonly status: VoiceStatus | null
  readonly progress: ProgressMap
  readonly error: string | null
  readonly refresh: () => void
  readonly download: (model: VoiceModelId) => void
  readonly cancel: (model: VoiceModelId) => void
}

function without(map: ProgressMap, model: VoiceModelId): ProgressMap {
  return Object.fromEntries(Object.entries(map).filter(([key]) => key !== model))
}

/**
 * whisper.cpp and model-file state for the Voice pane. Downloads run in the main process, so
 * closing Settings does not stop one; reopening picks it back up from `downloading` and the
 * progress events.
 */
export function useVoiceModels(): VoiceModels {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [progress, setProgress] = useState<ProgressMap>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback((): void => {
    void window.api.voice.status().then((result) => {
      if (result.ok) setStatus(result.data)
      else setError(result.error.message)
    })
  }, [])

  useEffect(() => {
    refresh()
    return window.api.voice.onDownloadProgress((event) => {
      setProgress((current) =>
        event.done ? without(current, event.model) : { ...current, [event.model]: event }
      )
      if (event.done) refresh()
    })
  }, [refresh])

  const download = useCallback((model: VoiceModelId): void => {
    setError(null)
    void window.api.voice.downloadModel(model).then((result) => {
      if (result.ok) setStatus(result.data)
      else if (result.error.code !== 'CANCELLED') setError(result.error.message)
    })
  }, [])

  const cancel = useCallback((model: VoiceModelId): void => {
    void window.api.voice.cancelDownload(model)
  }, [])

  return { status, progress, error, refresh, download, cancel }
}
