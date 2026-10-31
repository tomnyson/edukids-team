import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Folder, Plus, Square, X, Flame, AtSign } from 'lucide-react'
import type { EffortId, ModelId, Company, CompanyMember } from '@shared/types'
import { shortenPath } from '@renderer/lib/format'
import { useSettings } from '@renderer/hooks/settingsContext'
import { BotAvatar } from '@renderer/components/ui/BotFace'
import { AttachmentChips } from './Attachments'
import { RunSettings } from './RunSettings'
import { insertMention, matchMembers, mentionAt, startMention, type ComposerEdit } from './mention'

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
  const [caret, setCaret] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  // The `@` whose list was closed with Escape; typing a new `@` opens the list again
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // React leaves the caret at the end after a programmatic edit, so it is put back once rendered
  const pendingCaret = useRef<number | null>(null)
  const listId = useId()

  // Height is measured, not animated — the growth itself must not be a transition.
  useLayoutEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
    if (pendingCaret.current !== null) {
      node.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
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

  const members = company?.members ?? []
  const mention = mentionAt(value, caret)
  const suggestions = mention ? matchMembers(members, mention.text) : []
  const listOpen = mention !== null && suggestions.length > 0 && dismissedAt !== mention.start
  const active = Math.min(activeIndex, suggestions.length - 1)

  const applyEdit = (edit: ComposerEdit): void => {
    pendingCaret.current = edit.caret
    setValue(edit.value)
    setCaret(edit.caret)
    setActiveIndex(0)
    setDismissedAt(null)
    textareaRef.current?.focus()
  }

  const pickMember = (name: string): void => {
    if (mention) applyEdit(insertMention(value, mention, caret, name))
  }

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.target.value
    const at = event.target.selectionStart
    setValue(next)
    setCaret(at)
    setActiveIndex(0)
    if (dismissedAt !== null && mentionAt(next, at)?.start !== dismissedAt) setDismissedAt(null)
  }

  /** Arrows, Enter, Tab and Escape drive the open member list; true when the key was used. */
  const onListKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!listOpen || !mention) return false
    switch (event.key) {
      case 'ArrowDown':
        setActiveIndex((active + 1) % suggestions.length)
        break
      case 'ArrowUp':
        setActiveIndex((active - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
      case 'Tab':
        pickMember(suggestions[active].name)
        break
      case 'Escape':
        setDismissedAt(mention.start)
        break
      default:
        return false
    }
    event.preventDefault()
    return true
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Vietnamese and other IME input commits with Enter — never read that as send.
    if (event.nativeEvent.isComposing) return
    // With the member list open, Enter picks a member instead of sending a bare `@`
    if (onListKey(event)) return
    if (event.key !== 'Enter') return

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

        <div className="relative rounded-[var(--radius-2xl)] border border-line bg-surface shadow-[0_10px_34px_-18px_var(--c-shadow)] transition-colors duration-[var(--duration-normal)] focus-within:border-line-strong">
          {listOpen ? (
            <MentionList
              id={listId}
              members={suggestions}
              active={active}
              onHover={setActiveIndex}
              onPick={pickMember}
            />
          ) : null}

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

            {members.length > 0 ? (
              <MentionButton
                open={listOpen}
                disabled={disabled}
                // A textarea keeps its selection on blur, and it is never stale like `caret`
                onClick={() =>
                  applyEdit(startMention(value, textareaRef.current?.selectionStart ?? caret))
                }
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
              onChange={onChange}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              aria-autocomplete="list"
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={listOpen ? `${listId}-${suggestions[active].id}` : undefined}
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

interface MentionButtonProps {
  readonly open: boolean
  readonly disabled: boolean
  readonly onClick: () => void
}

/** Types an `@` at the caret, which opens the same member list as typing it. */
function MentionButton({ open, disabled, onClick }: MentionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Mention team member (@)"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)] hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent ${
        open ? 'bg-raised text-ink' : 'text-muted'
      }`}
    >
      <AtSign aria-hidden className="size-4" />
      <span className="sr-only">Mention team member</span>
    </button>
  )
}

interface MentionListProps {
  readonly id: string
  readonly members: readonly CompanyMember[]
  readonly active: number
  readonly onHover: (index: number) => void
  readonly onPick: (name: string) => void
}

/** The members matching the `@query` being typed; picking one puts `@name` in the prompt. */
function MentionList({
  id,
  members,
  active,
  onHover,
  onPick
}: MentionListProps): React.JSX.Element {
  return (
    <div className="absolute bottom-full left-2 z-30 mb-2 w-60 rounded-[var(--radius-xl)] border border-line-strong bg-surface p-1.5 shadow-[0_18px_44px_-14px_var(--c-shadow)]">
      <p className="px-2 pt-1 pb-1.5 text-[length:var(--text-micro)] text-faint">
        Mention a team member
      </p>
      <ul id={id} role="listbox" aria-label="Team members" className="max-h-64 overflow-y-auto">
        {members.map((member, index) => (
          <li
            key={member.id}
            id={`${id}-${member.id}`}
            role="option"
            aria-selected={index === active}
            // Keeps focus in the prompt; a blur first would close the list and lose the click
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(member.name)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-lg)] px-2 py-1.5 transition-colors duration-[var(--duration-fast)] ${
              index === active ? 'bg-raised' : ''
            }`}
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
          </li>
        ))}
      </ul>
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
