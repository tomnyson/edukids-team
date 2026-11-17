import { ipcMain, type BrowserWindow } from 'electron'
import { VOICE_CHANNELS } from '@shared/ipc'
import type { VoiceStatus } from '@shared/voice'
import { ensureMicAccess } from '../voice/mic'
import {
  cancelAllDownloads,
  cancelDownload,
  downloadModel,
  listModelStatus,
  sweepVoiceLeftovers
} from '../voice/models'
import { findWhisper } from '../voice/local-whisper'
import { cancelTranscription, transcribe } from '../voice/transcribe'
import { isVoiceModel } from '../voice/transcript'
import { fail, guard, ok } from './result'

async function voiceStatus(): Promise<VoiceStatus> {
  const [whisperPath, models] = await Promise.all([findWhisper(true), listModelStatus()])
  return { whisperPath, models }
}

const unknownModel = fail({ code: 'INVALID_INPUT', message: 'Unknown speech model.' })

export function registerVoiceIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // Leftovers from a quit or crash; runs in the background and never fails startup
  void sweepVoiceLeftovers()

  ipcMain.handle(
    VOICE_CHANNELS.ensureMic,
    guard('voice', async () => ok(await ensureMicAccess()))
  )

  ipcMain.handle(
    VOICE_CHANNELS.status,
    guard('voice', async () => ok(await voiceStatus()))
  )

  ipcMain.handle(
    VOICE_CHANNELS.transcribe,
    guard('voice', (_event, payload: unknown) => transcribe(payload))
  )

  ipcMain.handle(
    VOICE_CHANNELS.cancelTranscribe,
    guard('voice', () => {
      cancelTranscription()
      return ok(true)
    })
  )

  ipcMain.handle(
    VOICE_CHANNELS.downloadModel,
    guard('voice', async (_event, model: unknown) => {
      if (typeof model !== 'string' || !isVoiceModel(model)) return unknownModel
      const error = await downloadModel(model, (progress) =>
        getWindow()?.webContents.send(VOICE_CHANNELS.downloadProgress, progress)
      )
      return error ? fail(error) : ok(await voiceStatus())
    })
  )

  ipcMain.handle(
    VOICE_CHANNELS.cancelDownload,
    guard('voice', (_event, model: unknown) => {
      if (typeof model !== 'string' || !isVoiceModel(model)) return unknownModel
      cancelDownload(model)
      return ok(true)
    })
  )
}

/** Called on quit, so no whisper process or half-finished download outlives the app. */
export function abortVoiceWork(): void {
  cancelTranscription()
  cancelAllDownloads()
}
