import { useState } from 'react'
import { FolderCog, Mic, Palette, Info } from 'lucide-react'
import {
  EDITORS,
  SEND_KEYS,
  THEMES,
  type EditorId,
  type SendKeyId,
  type ThemeId
} from '@shared/settings'
import { EFFORTS, MODELS } from '@shared/types'
import { useSettings } from '@renderer/hooks/settingsContext'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Picker, Row, Segmented, type Choice } from './controls'
import { VoicePane } from './VoicePane'

/** `null` means "omit the flag and let the CLI decide", and needs a name in the UI. */
const CLI_DEFAULT = 'default'

const MODEL_CHOICES: readonly Choice<string>[] = [
  { id: CLI_DEFAULT, label: 'CLI default' },
  ...MODELS.map((model) => ({ id: model.id as string, label: model.label }))
]

const EFFORT_CHOICES: readonly Choice<string>[] = [
  { id: CLI_DEFAULT, label: 'CLI default' },
  ...EFFORTS.map((effort) => ({ id: effort.id as string, label: effort.label }))
]

const PANES = [
  { id: 'general', label: 'General', icon: FolderCog },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'about', label: 'About', icon: Info }
] as const

type PaneId = (typeof PANES)[number]['id']

interface SettingsDialogProps {
  readonly appVersion: string | null
  readonly claudeBinary: string | null | undefined
  readonly onClose: () => void
}

export function SettingsDialog({
  appVersion,
  claudeBinary,
  onClose
}: SettingsDialogProps): React.JSX.Element {
  const { settings, update } = useSettings()
  const [pane, setPane] = useState<PaneId>('general')
  const [fileNote, setFileNote] = useState<string | null>(null)

  const reveal = async (): Promise<void> => {
    const result = await window.api.openSettingsFile()
    setFileNote(result.ok ? result.data : result.error.message)
  }

  return (
    <Dialog title="Settings" onClose={onClose}>
      <nav
        aria-label="Settings sections"
        className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-line bg-rail p-3"
      >
        <p className="px-2 pt-1 pb-2 text-[length:var(--text-micro)] tracking-wide text-faint uppercase">
          Settings
        </p>
        {PANES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={pane === id}
            onClick={() => setPane(id)}
            className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[length:var(--text-ui)] transition-colors duration-[var(--duration-fast)] ${
              pane === id ? 'bg-raised text-ink' : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <Icon aria-hidden className={`size-3.5 ${pane === id ? 'text-accent' : ''}`} />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto py-5 pr-14 pl-6">
        {pane === 'general' ? (
          <section aria-label="General">
            <Row label="Default model" hint="Seeds the picker for every new chat.">
              <Picker
                label="Default model"
                value={settings.defaultModel ?? CLI_DEFAULT}
                options={MODEL_CHOICES}
                onChange={(value) =>
                  void update({ defaultModel: value === CLI_DEFAULT ? null : value })
                }
              />
            </Row>
            <Row label="Default effort" hint="How much reasoning a new chat starts with.">
              <Picker
                label="Default effort"
                value={settings.defaultEffort ?? CLI_DEFAULT}
                options={EFFORT_CHOICES}
                onChange={(value) =>
                  void update({ defaultEffort: value === CLI_DEFAULT ? null : value })
                }
              />
            </Row>
            <Row label="Open file paths in" hint="Used when you click a path in an answer.">
              <Picker<EditorId>
                label="Open file paths in"
                value={settings.editor}
                options={EDITORS}
                onChange={(value) => void update({ editor: value })}
              />
            </Row>
            <Row label="Sending" hint="Which key sends the prompt.">
              <Picker<SendKeyId>
                label="Sending"
                value={settings.sendKey}
                options={SEND_KEYS}
                onChange={(value) => void update({ sendKey: value })}
              />
            </Row>
            <Row
              label="Configuration file"
              hint={fileNote ?? 'Everything here is stored in one JSON file.'}
            >
              <button
                type="button"
                onClick={() => void reveal()}
                className="rounded-[var(--radius-md)] border border-line bg-canvas px-3 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:text-ink"
              >
                Show in Finder
              </button>
            </Row>
          </section>
        ) : null}

        {pane === 'appearance' ? (
          <section aria-label="Appearance">
            <Row label="Theme" hint="System follows whatever macOS is set to.">
              <Segmented<ThemeId>
                label="Theme"
                value={settings.theme}
                options={THEMES}
                onChange={(value) => void update({ theme: value })}
              />
            </Row>
          </section>
        ) : null}

        {pane === 'voice' ? <VoicePane /> : null}

        {pane === 'about' ? (
          <section aria-label="About" className="space-y-3">
            <Row label="Claude GUI" hint="A desktop front end for the Claude CLI.">
              <span className="font-mono text-[length:var(--text-meta)] text-muted">
                {appVersion ?? '—'}
              </span>
            </Row>
            <Row label="CLI binary" hint={claudeBinary ?? 'Not found on your PATH.'}>
              <span
                className={`font-mono text-[length:var(--text-meta)] ${claudeBinary ? 'text-ok' : 'text-danger'}`}
              >
                {claudeBinary ? 'ready' : claudeBinary === undefined ? 'checking' : 'missing'}
              </span>
            </Row>
          </section>
        ) : null}
      </div>
    </Dialog>
  )
}
