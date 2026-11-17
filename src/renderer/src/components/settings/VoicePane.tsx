import { useState } from 'react'
import { Check, ShieldAlert } from 'lucide-react'
import {
  VOICE_BACKENDS,
  VOICE_MODELS,
  type VoiceBackendId,
  type VoiceModelId
} from '@shared/settings'
import type { VoiceStatus } from '@shared/voice'
import { useSettings } from '@renderer/hooks/settingsContext'
import { useVoiceModels } from '@renderer/hooks/useVoiceModels'
import { Picker, Row, type Choice } from './controls'
import { VoiceLocalSetup } from './VoiceLocalSetup'

const LANGUAGES: readonly Choice<string>[] = [
  { id: 'auto', label: 'Detect automatically' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' }
]

/** Each model with its size, and a mark on the ones already on disk. */
function modelChoices(status: VoiceStatus | null): readonly Choice<VoiceModelId>[] {
  return VOICE_MODELS.map((id) => {
    const model = status?.models.find((entry) => entry.model === id)
    if (!model) return { id, label: id }
    return { id, label: `${id} · ${model.approxMib} MB${model.installed ? ' · downloaded' : ''}` }
  })
}

const BACKEND_CHOICES: readonly Choice<VoiceBackendId>[] = VOICE_BACKENDS.map((backend) => ({
  id: backend.id,
  label: backend.label
}))

/**
 * Dictation settings. The key field is write-only by design: the main process
 * stores it in the system keychain and only ever reports whether one is set.
 */
export function VoicePane(): React.JSX.Element {
  const { settings, update, setVoiceKey } = useSettings()
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const local = useVoiceModels()

  const save = async (): Promise<void> => {
    const result = await setVoiceKey(draft)
    setNote(result.ok ? 'Saved to the system keychain.' : result.error.message)
    if (result.ok) setDraft('')
  }

  const clear = async (): Promise<void> => {
    const result = await setVoiceKey(null)
    setNote(result.ok ? 'Key removed.' : result.error.message)
  }

  const cloud = settings.voice.backend === 'cloud'

  return (
    <section aria-label="Voice">
      <Row
        label="Transcribe with"
        hint={VOICE_BACKENDS.find((b) => b.id === settings.voice.backend)?.hint}
      >
        <Picker<VoiceBackendId>
          label="Transcribe with"
          value={settings.voice.backend}
          options={BACKEND_CHOICES}
          onChange={(value) => void update({ voice: { backend: value } })}
        />
      </Row>

      <Row label="Spoken language" hint="Naming the language beats detection on short takes.">
        <Picker
          label="Spoken language"
          value={settings.voice.language}
          options={LANGUAGES}
          onChange={(value) => void update({ voice: { language: value } })}
        />
      </Row>

      {cloud ? null : (
        <>
          <Row
            label="Local model"
            hint="Bigger is slower and more accurate. Vietnamese needs small or above."
          >
            <Picker<VoiceModelId>
              label="Local model"
              value={settings.voice.localModel}
              options={modelChoices(local.status)}
              onChange={(value) => void update({ voice: { localModel: value } })}
            />
          </Row>
          <VoiceLocalSetup voice={local} model={settings.voice.localModel} />
        </>
      )}

      {cloud ? (
        <>
          <div className="flex items-start gap-2 border-b border-line py-3">
            <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
            <p className="text-[length:var(--text-micro)] leading-relaxed text-muted">
              With this backend your recording is uploaded to a third-party service. Choose
              &ldquo;On this Mac&rdquo; to keep audio on the machine.
            </p>
          </div>

          <Row
            label="API key"
            hint={
              note ??
              (settings.voiceKeyConfigured
                ? 'A key is stored. Paste a new one to replace it.'
                : 'Stored encrypted; it is never sent back to this window.')
            }
          >
            <div className="flex items-center gap-1.5">
              <input
                type="password"
                aria-label="API key"
                value={draft}
                placeholder={settings.voiceKeyConfigured ? '••••••••••••' : 'sk-…'}
                onChange={(event) => setDraft(event.target.value)}
                className="selectable w-48 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 font-mono text-[length:var(--text-meta)] text-ink placeholder:text-faint focus:border-line-strong"
              />
              <button
                type="button"
                onClick={() => void save()}
                disabled={!draft.trim()}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-accent-dim hover:text-ink disabled:opacity-40"
              >
                <Check aria-hidden className="size-3.5" />
                Save
              </button>
              {settings.voiceKeyConfigured ? (
                <button
                  type="button"
                  onClick={() => void clear()}
                  className="rounded-[var(--radius-md)] px-2 py-1.5 text-[length:var(--text-ui)] text-faint transition-colors duration-[var(--duration-fast)] hover:text-danger"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Row>
        </>
      ) : null}
    </section>
  )
}
