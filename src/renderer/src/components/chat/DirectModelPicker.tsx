import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { CompanyMember, ModelOption, ProviderId } from '@shared/types'
import { Popover, type CloseIntent } from '@renderer/components/ui/Popover'
import { PROVIDER_OPTIONS } from '@renderer/lib/providers'

interface DirectModelPickerProps {
  /** The one model answering this chat. */
  readonly member: CompanyMember
  readonly disabled: boolean
  readonly onChange: (provider: ProviderId, modelId: string) => void
}

type ModelList =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly models: readonly ModelOption[] }
  | { readonly status: 'failed'; readonly message: string }

const LOADING: ModelList = { status: 'loading' }

/**
 * Which model answers a direct chat, changed from the composer. The choice applies from the next
 * prompt; turns already in the transcript keep what they were answered with.
 */
export function DirectModelPicker({
  member,
  disabled,
  onChange
}: DirectModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Browsing another provider's models changes nothing until one of them is picked
  const [provider, setProvider] = useState<ProviderId>(member.provider)
  const [list, setList] = useState<ModelList>(LOADING)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(({ restoreFocus }: CloseIntent): void => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.api.providers.listModels(provider).then((result) => {
      if (cancelled) return
      setList(
        result.ok
          ? { status: 'ready', models: result.data }
          : { status: 'failed', message: result.error.message }
      )
    })
    return () => {
      cancelled = true
    }
  }, [open, provider])

  const toggle = (): void => {
    if (open) return close({ restoreFocus: false })
    setProvider(member.provider)
    setList(LOADING)
    setOpen(true)
  }

  const browse = (next: ProviderId): void => {
    setList(LOADING)
    setProvider(next)
  }

  const choose = (modelId: string): void => {
    onChange(provider, modelId)
    close({ restoreFocus: true })
  }

  return (
    <div className="relative flex items-center">
      <button
        id="direct-model"
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        title={`Model for the next turn: ${member.provider} · ${member.modelId}`}
        className="flex max-w-48 cursor-pointer items-center gap-1 rounded-full border border-transparent py-1 pr-1.5 pl-2 font-mono text-[length:var(--text-micro)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-transparent disabled:hover:bg-transparent"
      >
        <span className="truncate">{member.modelId}</span>
        <ChevronDown aria-hidden className="size-3 shrink-0 text-faint" />
      </button>

      <Popover open={open} label="Model" anchorRef={triggerRef} onClose={close}>
        <div className="px-3 pt-1.5 pb-2">
          <label htmlFor="direct-model-provider" className="sr-only">
            Provider
          </label>
          <select
            id="direct-model-provider"
            value={provider}
            onChange={(event) => browse(event.target.value as ProviderId)}
            className="w-full rounded-[var(--radius-lg)] border border-line bg-raised px-2 py-1 text-[length:var(--text-ui)] text-ink focus-visible:border-line-strong focus-visible:outline-none"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div role="separator" className="h-px bg-line" />

        <ModelRows
          list={list}
          selectedId={provider === member.provider ? member.modelId : null}
          onChoose={choose}
        />
      </Popover>
    </div>
  )
}

interface ModelRowsProps {
  readonly list: ModelList
  readonly selectedId: string | null
  readonly onChoose: (modelId: string) => void
}

function ModelRows({ list, selectedId, onChoose }: ModelRowsProps): React.JSX.Element {
  if (list.status === 'loading') return <Note>Loading models…</Note>
  if (list.status === 'failed') return <Note>{list.message}</Note>
  if (list.models.length === 0) {
    return <Note>No models listed. Check this provider’s key in Providers.</Note>
  }

  return (
    <div role="menu" aria-label="Models" className="max-h-64 overflow-y-auto py-1">
      {list.models.map((model) => (
        <button
          key={model.id}
          type="button"
          role="menuitemradio"
          aria-checked={model.id === selectedId}
          onClick={() => onChoose(model.id)}
          className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-raised focus-visible:bg-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[length:var(--text-ui)] text-ink">
              {model.name}
            </span>
            <span className="block truncate font-mono text-[length:var(--text-micro)] text-faint">
              {[model.id, model.reasoning ? 'reasoning' : null, model.free ? 'free' : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {model.id === selectedId ? (
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
          ) : (
            <span aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          )}
        </button>
      ))}
    </div>
  )
}

function Note({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="px-3 py-2 text-[length:var(--text-micro)] leading-snug text-faint">{children}</p>
  )
}
