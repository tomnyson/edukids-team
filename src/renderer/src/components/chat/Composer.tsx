import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Folder, Plus, Square, X } from 'lucide-react'
import type { EffortId, ModelId } from '@shared/types'
import { shortenPath } from '@renderer/lib/format'
import { useSettings } from '@renderer/hooks/settingsContext'
import { AttachmentChips } from './Attachments'
import { RunSettings } from './RunSettings'

const MAX_ROWS_PX = 240

interface ComposerProps {
  /** True on an empty transcript, where the composer is the centred hero. */
  readonly centered: boolean
  readonly disabled: boolean
  readonly busy: boolean
  readonly cwd: string | null
  readonly attachments: readonly string[]
  readonly notice: string | null
  readonly model: ModelId | null
  readonly effort: EffortId | null
  readonly onSubmit: (prompt: string) => void
  readonly onCancel: () => void
  readonly onAttach: () => void
  readonly onRemoveAttachment: (path: string) => void
  readonly onDismissNotice: () => void
  readonly onModelChange: (model: ModelId | null) => void
  readonly onEffortChange: (effort: EffortId | null) => void
}

export function Composer({
  centered,
  disabled,
  busy,
  cwd,
  attachments,
  notice,
  model,
  effort,
  onSubmit,
  onCancel,
  onAttach,
  onRemoveAttachment,
  onDismissNotice,
  onModelChange,
  onEffortChange
}: ComposerProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Height is measured, not animated — the growth itself must not be a transition.
  useLayoutEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
  }, [value])

  useEffect(() => {
    if (!busy) textareaRef.current?.focus()
  }, [busy])

  const sendOnEnter = useSettings().settings.sendKey === 'enter'
  const sendHint = sendOnEnter ? '↵ to send' : '⌘↵ to send'

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || busy || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter') return
    // Vietnamese and other IME input commits with Enter — never read that as send.
    if (event.nativeEvent.isComposing) return

    const withModifier = event.metaKey || event.ctrlKey
    // ⌘↵ always sends; a bare Enter only when the setting says so.
    if (withModifier || (sendOnEnter && !event.shiftKey && !event.altKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div
      className={
        centered ? 'flex-[1.3] px-6 pt-1' : 'shrink-0 border-t border-line bg-canvas px-6 pt-3 pb-4'
      }
    >
      <div className="mx-auto w-full max-w-[var(--measure)] space-y-2">
        {notice ? <AttachNotice notice={notice} onDismiss={onDismissNotice} /> : null}

        <div className="rounded-[var(--radius-xl)] border border-line bg-surface transition-colors duration-[var(--duration-normal)] focus-within:border-accent-dim">
          {attachments.length > 0 ? (
            <AttachmentChips paths={attachments} onRemove={onRemoveAttachment} />
          ) : null}

          <label htmlFor="composer" className="sr-only">
            Prompt
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={disabled ? 'No conversation open' : 'Ask Claude anything…'}
            className="selectable block w-full resize-none bg-transparent px-4 pt-3.5 pb-3 font-mono text-[length:var(--text-meta)] leading-[1.65] text-ink placeholder:text-faint focus-visible:outline-none disabled:cursor-not-allowed"
          />

          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                id="attach"
                type="button"
                onClick={onAttach}
                disabled={disabled}
                title="Attach files"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-line disabled:hover:bg-transparent"
              >
                <Plus aria-hidden className="size-4" />
                <span className="sr-only">Attach files</span>
              </button>

              {cwd ? (
                <span
                  title={`Claude runs in ${cwd}`}
                  className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[length:var(--text-micro)] text-faint"
                >
                  <Folder aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{shortenPath(cwd)}</span>
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[length:var(--text-micro)] tracking-wide text-faint">
                {busy ? 'Claude is working…' : sendHint}
              </span>

              <RunSettings
                model={model}
                effort={effort}
                disabled={disabled}
                onModelChange={onModelChange}
                onEffortChange={onEffortChange}
              />

              {busy ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 font-mono text-[length:var(--text-micro)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-danger hover:text-danger"
                >
                  <Square aria-hidden className="size-3 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!value.trim() || disabled}
                  title={`Send (${sendOnEnter ? '↵' : '⌘↵'})`}
                  className="flex size-7 items-center justify-center rounded-full bg-accent text-void transition-all duration-[var(--duration-fast)] hover:bg-accent-bright active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:active:scale-100"
                >
                  <ArrowUp aria-hidden className="size-4" strokeWidth={2.5} />
                  <span className="sr-only">Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface AttachNoticeProps {
  readonly notice: string
  readonly onDismiss: () => void
}

/** Says what could not be attached; quieter than the run-failure notice. */
function AttachNotice({ notice, onDismiss }: AttachNoticeProps): React.JSX.Element {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-line bg-raised px-3 py-2 font-mono text-[length:var(--text-micro)] leading-relaxed text-muted"
    >
      <span className="flex-1">{notice}</span>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        className="shrink-0 text-faint transition-colors duration-[var(--duration-fast)] hover:text-ink"
      >
        <X aria-hidden className="size-3.5" />
        <span className="sr-only">Dismiss</span>
      </button>
    </p>
  )
}
