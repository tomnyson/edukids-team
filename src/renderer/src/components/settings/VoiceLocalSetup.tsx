import { Check, Download, RefreshCw, X } from 'lucide-react'
import type { VoiceModelId } from '@shared/settings'
import type { VoiceDownloadProgress, VoiceModelStatus } from '@shared/voice'
import { shortenPath } from '@renderer/lib/format'
import type { VoiceModels } from '@renderer/hooks/useVoiceModels'
import { Row } from './controls'

const MIB = 1024 * 1024
const INSTALL_COMMAND = 'brew install whisper-cpp'

const QUIET_BUTTON =
  'flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-accent-dim hover:text-ink disabled:opacity-40'

function Ready({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1 text-[length:var(--text-ui)] text-ok">
      <Check aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}

function WhisperRow({ voice }: { readonly voice: VoiceModels }): React.JSX.Element {
  const path = voice.status?.whisperPath ?? null
  const checking = voice.status === null
  return (
    <Row
      label="whisper.cpp"
      hint={
        checking
          ? 'Looking for it…'
          : path
            ? shortenPath(path)
            : `Not installed. Run \`${INSTALL_COMMAND}\` in Terminal, then check again.`
      }
    >
      {path ? (
        <Ready label="Found" />
      ) : (
        <button type="button" onClick={voice.refresh} disabled={checking} className={QUIET_BUTTON}>
          <RefreshCw aria-hidden className="size-3.5" />
          Check again
        </button>
      )}
    </Row>
  )
}

function percent(progress: VoiceDownloadProgress): number {
  if (progress.totalBytes <= 0) return 0
  return Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
}

function DownloadBar({
  progress
}: {
  readonly progress: VoiceDownloadProgress
}): React.JSX.Element {
  const value = percent(progress)
  return (
    <div
      role="progressbar"
      aria-label="Model download"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-1.5 w-28 overflow-hidden rounded-[var(--radius-pill)] bg-raised"
    >
      {/* Scaled, not resized, so the bar animates on the compositor */}
      <div
        className="h-full w-full origin-left bg-accent transition-transform duration-[var(--duration-normal)]"
        style={{ transform: `scaleX(${value / 100})` }}
      />
    </div>
  )
}

function modelHint(model: VoiceModelStatus, progress: VoiceDownloadProgress | undefined): string {
  if (model.installed) return `Downloaded · about ${model.approxMib} MB on disk.`
  if (progress) {
    const received = Math.round(progress.receivedBytes / MIB)
    return `Downloading ${received} of ${Math.round(progress.totalBytes / MIB)} MB…`
  }
  if (model.downloading) return 'Downloading…'
  return `Not downloaded · about ${model.approxMib} MB from Hugging Face.`
}

interface ModelRowProps {
  readonly voice: VoiceModels
  readonly model: VoiceModelId
}

function ModelRow({ voice, model }: ModelRowProps): React.JSX.Element | null {
  const status = voice.status?.models.find((entry) => entry.model === model)
  if (!status) return null
  const progress = voice.progress[model]
  const downloading = progress !== undefined || status.downloading

  return (
    <Row label="Model file" hint={voice.error ?? modelHint(status, progress)}>
      {status.installed ? (
        <Ready label="Ready" />
      ) : downloading ? (
        <div className="flex items-center gap-2">
          {progress ? <DownloadBar progress={progress} /> : null}
          <button
            type="button"
            onClick={() => voice.cancel(model)}
            title="Cancel download"
            className="rounded-[var(--radius-md)] p-1.5 text-faint transition-colors duration-[var(--duration-fast)] hover:text-danger"
          >
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Cancel download</span>
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => voice.download(model)} className={QUIET_BUTTON}>
          <Download aria-hidden className="size-3.5" />
          Download
        </button>
      )}
    </Row>
  )
}

interface VoiceLocalSetupProps {
  readonly voice: VoiceModels
  readonly model: VoiceModelId
}

/** What on-device transcription needs: the whisper.cpp binary and the chosen model file. */
export function VoiceLocalSetup({ voice, model }: VoiceLocalSetupProps): React.JSX.Element {
  return (
    <>
      <WhisperRow voice={voice} />
      <ModelRow voice={voice} model={model} />
    </>
  )
}
