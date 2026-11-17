/** Shapes the voice IPC channels carry. Types only, so either side imports them freely. */
import type { VoiceModelId } from './settings'
import type { AppError } from './types'

/** macOS consent states, plus 'unknown' where the OS has no such concept. */
export type MicStatus = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export interface MicAccess {
  readonly granted: boolean
  readonly status: MicStatus
}

export interface VoiceModelStatus {
  readonly model: VoiceModelId
  readonly installed: boolean
  /** Rough download size, for the button label. */
  readonly approxMib: number
  readonly downloading: boolean
}

export interface VoiceStatus {
  /** Absolute path of whisper-cli, or null when whisper.cpp is not installed. */
  readonly whisperPath: string | null
  readonly models: readonly VoiceModelStatus[]
}

/** Pushed while a model downloads. `done` is sent once, with `error` set when it failed. */
export interface VoiceDownloadProgress {
  readonly model: VoiceModelId
  readonly receivedBytes: number
  /** From content-length, or the approximate size when the server omits it. */
  readonly totalBytes: number
  readonly done: boolean
  readonly error: AppError | null
}
