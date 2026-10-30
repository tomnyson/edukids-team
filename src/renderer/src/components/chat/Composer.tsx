import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Folder, Plus, Square, X, Flame, AtSign } from 'lucide-react'
import type { EffortId, ModelId, Company, CompanyMember } from '@shared/types'
import { shortenPath } from '@renderer/lib/format'
import { useSettings } from '@renderer/hooks/settingsContext'
import { BotAvatar } from '@renderer/components/ui/BotFace'
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
  readonly company?: Company | null
  readonly onToggleFunMode?: () => void
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
  company,
  onToggleFunMode,
  onSubmit,
  onCancel,
  onAttach,
  onRemoveAttachment,
  onDismissNotice,
  onModelChange,
  onEffortChange
}: ComposerProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [showMentions, setShowMentions] = useState(false)
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

  const status = busy ? (company ? `${company.name} is working…` : 'Claude is working…') : sendHint

  return (
    <div className={centered ? 'flex-[1.3] px-6 pt-1' : 'shrink-0 bg-canvas px-6 pt-2 pb-4'}>
      <div className="mx-auto w-full max-w-[var(--measure)] space-y-2">
        {notice ? <AttachNotice notice={notice} onDismiss={onDismissNotice} /> : null}

        <div className="rounded-[var(--radius-2xl)] border border-line bg-surface shadow-[0_10px_34px_-18px_var(--c-shadow)] transition-colors duration-[var(--duration-normal)] focus-within:border-line-strong">
          {attachments.length > 0 ? (
            <AttachmentChips paths={attachments} onRemove={onRemoveAttachment} />
          ) : null}

          <div className="flex items-end gap-1 p-2">
            <button
              id="attach"
              type="button"
              onClick={onAttach}
              disabled={disabled}
              title="Attach files"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-line disabled:hover:bg-transparent"
            >
              <Plus aria-hidden className="size-[1.125rem]" />
              <span className="sr-only">Attach files</span>
            </button>

            {company?.members && company.members.length > 0 ? (
              <MentionMenu
                members={company.members}
                open={showMentions}
                onToggle={() => setShowMentions((open) => !open)}
                onPick={(name) => {
                  setValue((prev) => `${prev}@${name} `)
                  setShowMentions(false)
                  textareaRef.current?.focus()
                }}
              />
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
              placeholder={
                disabled
                  ? 'No conversation open'
                  : company
                    ? `Ask ${company.name}…`
                    : 'Ask Claude anything…'
              }
              className="selectable block min-h-9 flex-1 resize-none bg-transparent px-2 py-[0.4rem] text-[length:var(--text-body)] leading-[1.5] text-ink placeholder:text-faint focus-visible:outline-none disabled:cursor-not-allowed"
            />

            {company ? null : (
              <div className="flex h-9 items-center">
                <RunSettings
                  model={model}
                  effort={effort}
                  disabled={disabled}
                  onModelChange={onModelChange}
                  onEffortChange={onEffortChange}
                />
              </div>
            )}

            {busy ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border border-line-strong px-3.5 text-[length:var(--text-meta)] font-medium text-muted transition-colors duration-[var(--duration-fast)] hover:border-danger hover:text-danger"
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
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-canvas transition-all duration-[var(--duration-fast)] hover:bg-accent-bright active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:active:scale-100"
              >
                <ArrowUp aria-hidden className="size-[1.125rem]" strokeWidth={2.5} />
                <span className="sr-only">Send</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-2">
            {company ? <FunModeToggle on={company.funMode} onToggle={onToggleFunMode} /> : null}
            {cwd ? (
              <span
                title={`Runs in ${cwd}`}
                className="flex min-w-0 items-center gap-1.5 font-mono text-[length:var(--text-micro)] text-faint"
              >
                <Folder aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{shortenPath(cwd)}</span>
              </span>
            ) : null}
          </div>
          <span className="shrink-0 text-[length:var(--text-micro)] text-faint">{status}</span>
        </div>
      </div>
    </div>
  )
}

interface MentionMenuProps {
  readonly members: readonly CompanyMember[]
  readonly open: boolean
  readonly onToggle: () => void
  readonly onPick: (name: string) => void
}

/** Puts `@name` in the prompt so the turn is addressed to one bot. */
function MentionMenu({ members, open, onToggle, onPick }: MentionMenuProps): React.JSX.Element {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title="Mention team member (@)"
        className={`flex size-9 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink ${
          open ? 'bg-raised text-ink' : 'text-muted'
        }`}
      >
        <AtSign aria-hidden className="size-4" />
        <span className="sr-only">Mention team member</span>
      </button>

      {open ? (
        <div className="absolute bottom-11 left-0 z-30 w-56 rounded-[var(--radius-xl)] border border-line-strong bg-surface p-1.5 shadow-[0_18px_44px_-14px_var(--c-shadow)]">
          <p className="px-2 pt-1 pb-1.5 text-[length:var(--text-micro)] text-faint">Ask one bot</p>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onPick(member.name)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-raised"
            >
              <BotAvatar seed={member.name} color={member.avatarColor} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--text-ui)] font-medium text-ink">
                  {member.name}
                </span>
                <span className="block truncate text-[length:var(--text-micro)] text-faint">
                  {member.role}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface FunModeToggleProps {
  readonly on: boolean
  readonly onToggle?: () => void
}

function FunModeToggle({ on, onToggle }: FunModeToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title="Toggle Grok Fun Mode"
      className={`flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[length:var(--text-micro)] font-medium transition-colors duration-[var(--duration-fast)] ${
        on
          ? 'border-warn/50 bg-warn/12 text-warn'
          : 'border-line text-faint hover:border-line-strong hover:text-muted'
      }`}
    >
      <Flame aria-hidden className={`size-3 ${on ? 'fill-current' : ''}`} />
      Fun mode
    </button>
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
      className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-line bg-raised px-3 py-2 font-mono text-[length:var(--text-micro)] leading-relaxed text-muted"
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
