import { useCallback, useEffect, useRef, useState } from 'react'
import { LIMITS } from '@shared/ipc'
import type { AppError } from '@shared/types'
import { toSpeechWav } from '@renderer/lib/speechAudio'

export type DictationPhase = 'idle' | 'starting' | 'recording' | 'transcribing'

export interface Dictation {
  readonly phase: DictationPhase
  /** Whole seconds recorded so far in the current take. */
  readonly seconds: number
  readonly error: string | null
  /** Starts a take when idle, stops and transcribes while recording, cancels otherwise. */
  readonly toggle: () => void
  /** Drops the take: nothing is transcribed or inserted. */
  readonly cancel: () => void
  readonly clearError: () => void
}

const AUDIO: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

const MIC_BLOCKED =
  'Microphone access is off. Allow Claude GUI in System Settings → Privacy & Security → Microphone.'
const DETAIL_MAX = 300
const TICK_MS = 250

interface Take {
  readonly recorder: MediaRecorder
  readonly stream: MediaStream
  readonly ticker: number
  readonly limit: number
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

function micError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return MIC_BLOCKED
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.'
  if (name === 'NotReadableError') return 'The microphone is in use by another app.'
  return 'The microphone could not be opened.'
}

/** A user-facing line for a failed transcription; null when the user stopped it. */
function describe(error: AppError): string | null {
  if (error.code === 'CANCELLED') return null
  if (!error.detail) return error.message
  const detail =
    error.detail.length > DETAIL_MAX ? `…${error.detail.slice(-DETAIL_MAX)}` : error.detail
  return `${error.message} ${detail}`
}

/**
 * Records one take from the microphone, converts it to speech WAV and has the main process
 * transcribe it. Every take gets an id; anything that resolves after a cancel or a newer
 * take compares ids and drops its result, so a stale transcript is never inserted.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [phase, setPhase] = useState<DictationPhase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const takeId = useRef(0)
  const take = useRef<Take | null>(null)
  const transcribing = useRef(false)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  const settle = useCallback((message: string | null): void => {
    setPhase('idle')
    setSeconds(0)
    setError(message)
  }, [])

  /** Detaches the live take and stops its timers; the recorder and stream are the caller's. */
  const detach = useCallback((): Take | null => {
    const current = take.current
    take.current = null
    if (current) {
      window.clearInterval(current.ticker)
      window.clearTimeout(current.limit)
    }
    return current
  }, [])

  const transcribeClip = useCallback(
    async (id: number, clip: Blob): Promise<void> => {
      if (clip.size === 0) return settle('Nothing was recorded.')
      setPhase('transcribing')
      transcribing.current = true
      try {
        const wav = await toSpeechWav(clip)
        if (id !== takeId.current) return
        const result = await window.api.voice.transcribe(wav)
        if (id !== takeId.current) return
        if (!result.ok) return settle(describe(result.error))
        if (!result.data) return settle('No speech was recognized.')
        onTextRef.current(result.data)
        settle(null)
      } catch {
        if (id === takeId.current) settle('The recording could not be decoded.')
      } finally {
        if (id === takeId.current) transcribing.current = false
      }
    },
    [settle]
  )

  /** Stops recording and transcribes what was captured. */
  const finish = useCallback((): void => {
    const current = detach()
    if (current && current.recorder.state !== 'inactive') current.recorder.stop()
  }, [detach])

  const record = useCallback(
    (id: number, stream: MediaStream): void => {
      const recorder = new MediaRecorder(stream)
      let chunks: readonly Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks = [...chunks, event.data]
      }
      // Also fires when the device goes away mid-take; what was captured still counts
      recorder.onstop = () => {
        if (take.current?.recorder === recorder) detach()
        stopTracks(stream)
        if (id === takeId.current)
          void transcribeClip(id, new Blob([...chunks], { type: recorder.mimeType }))
      }
      const startedAt = Date.now()
      take.current = {
        recorder,
        stream,
        ticker: window.setInterval(
          () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
          TICK_MS
        ),
        limit: window.setTimeout(finish, LIMITS.voiceMaxSeconds * 1000)
      }
      recorder.start()
      setPhase('recording')
    },
    [detach, finish, transcribeClip]
  )

  const begin = useCallback(async (): Promise<void> => {
    takeId.current += 1
    const id = takeId.current
    setError(null)
    setSeconds(0)
    setPhase('starting')

    const access = await window.api.voice.ensureMic()
    if (id !== takeId.current) return
    if (!access.ok) return settle(access.error.message)
    if (!access.data.granted) return settle(MIC_BLOCKED)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO })
    } catch (failure) {
      if (id === takeId.current) settle(micError(failure))
      return
    }
    if (id !== takeId.current) return stopTracks(stream)
    try {
      record(id, stream)
    } catch {
      detach()
      stopTracks(stream)
      settle('This system cannot record audio.')
    }
  }, [detach, record, settle])

  const cancel = useCallback((): void => {
    takeId.current += 1
    const current = detach()
    if (current) {
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      stopTracks(current.stream)
    }
    if (transcribing.current) {
      transcribing.current = false
      void window.api.voice.cancelTranscribe()
    }
    settle(null)
  }, [detach, settle])

  // Leaving the conversation must not leave the microphone on or a clip transcribing
  useEffect(() => cancel, [cancel])

  const toggle = useCallback((): void => {
    if (phase === 'idle') void begin()
    else if (phase === 'recording') finish()
    else cancel()
  }, [phase, begin, finish, cancel])

  const clearError = useCallback((): void => setError(null), [])

  return { phase, seconds, error, toggle, cancel, clearError }
}

/** ⌘⇧M (Ctrl+Shift+M elsewhere) toggles dictation from anywhere in the window. */
export function useDictationShortcut(toggle: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      // The physical key, so the shortcut survives Vietnamese and other layouts
      if (event.code !== 'KeyM' || !event.shiftKey || event.altKey) return
      if (!(event.metaKey || event.ctrlKey) || event.repeat) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, enabled])
}
