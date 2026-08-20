import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelLeftOpen, Paperclip } from 'lucide-react'
import type { Conversation, EffortId, ModelId } from '@shared/types'
import { useAttachments } from '@renderer/hooks/useAttachments'
import { useChatStream, type SendOptions } from '@renderer/hooks/useChatStream'
import { shortenPath } from '@renderer/lib/format'
import { ClaudeMark } from '@renderer/components/ui/ClaudeMark'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { Composer } from './Composer'
import { PendingTurnView, Turn } from './Turn'

interface ChatPaneProps {
  readonly conversation: Conversation | null
  readonly appVersion: string | null
  readonly railHidden: boolean
  readonly onShowRail: () => void
  readonly onConversationChanged: () => void
}

export function ChatPane({
  conversation,
  appVersion,
  railHidden,
  onShowRail,
  onConversationChanged
}: ChatPaneProps): React.JSX.Element {
  const conversationId = conversation?.id ?? null
  const { messages, pending, loading, error, send, cancel, dismissError } = useChatStream(
    conversationId,
    onConversationChanged
  )

  const attachments = useAttachments()
  // Seeded from the last turn because the pane remounts per conversation.
  const [model, setModel] = useState<ModelId | null>(conversation?.lastModel ?? null)
  const [effort, setEffort] = useState<EffortId | null>(conversation?.lastEffort ?? null)
  const [dragging, setDragging] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSentRef = useRef<{ prompt: string; options: SendOptions } | null>(null)
  const pinnedToBottom = useRef(true)
  // dragenter/dragleave fire for every child, so nesting is counted, not guessed.
  const dragDepth = useRef(0)

  // Follow the stream only while the reader is already at the bottom.
  const onScroll = useCallback((): void => {
    const node = scrollRef.current
    if (!node) return
    pinnedToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  useEffect(() => {
    if (pinnedToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messages, pending?.streamed])

  const { paths, add, clear } = attachments

  const submit = useCallback(
    (prompt: string) => {
      const options: SendOptions = { model, effort, attachments: paths }
      lastSentRef.current = { prompt, options }
      pinnedToBottom.current = true
      clear()
      void send(prompt, options)
    },
    [clear, effort, model, paths, send]
  )

  const retry = useCallback(() => {
    const last = lastSentRef.current
    if (!last) return
    dismissError()
    void send(last.prompt, last.options)
  }, [dismissError, send])

  const pickFiles = useCallback(async (): Promise<void> => {
    const result = await window.api.pickFiles()
    if (result.ok && result.data.length > 0) add(result.data)
  }, [add])

  const onDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)

      const dropped = [...event.dataTransfer.files].map((file) => window.api.pathForFile(file))
      const usable = dropped.filter(Boolean)
      add(usable, dropped.length - usable.length)
    },
    [add]
  )

  const isEmpty = messages.length === 0 && !pending
  const canAttach = conversationId !== null

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col bg-canvas"
      aria-label="Conversation"
      onDragEnter={(event) => {
        if (!canAttach) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!canAttach) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={canAttach ? onDrop : undefined}
    >
      {/* The title bar doubles as the macOS drag region; its children opt back out. */}
      <header
        className={`flex h-12 shrink-0 items-center gap-3 px-4 ${isEmpty ? '' : 'border-b border-line'}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {railHidden ? (
          <button
            type="button"
            onClick={onShowRail}
            title="Show sidebar"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="ml-[4.5rem] flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
          >
            <PanelLeftOpen aria-hidden className="size-4" />
            <span className="sr-only">Show sidebar</span>
          </button>
        ) : null}

        {isEmpty ? null : (
          <>
            <h1
              className="truncate text-[length:var(--text-ui)] font-medium text-ink"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {conversation?.title ?? 'No conversation'}
            </h1>
            {conversation ? (
              <span
                title={conversation.cwd}
                className="shrink-0 truncate font-mono text-[length:var(--text-micro)] text-faint"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                {shortenPath(conversation.cwd)}
              </span>
            ) : null}
          </>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={
          isEmpty
            ? 'flex min-h-0 flex-1 items-end justify-center px-6'
            : 'min-h-0 flex-1 overflow-y-auto px-6 py-8'
        }
      >
        <div className="mx-auto w-full max-w-[var(--measure)] space-y-[var(--space-turn)]">
          {isEmpty ? <EmptyState appVersion={appVersion} /> : null}

          {messages.map((message) => (
            <Turn key={message.id} message={message} />
          ))}

          {pending ? (
            <PendingTurnView
              prompt={pending.prompt}
              streamed={pending.streamed}
              activeTool={pending.activeTool}
            />
          ) : null}

          {error ? <ErrorNotice error={error} onDismiss={dismissError} onRetry={retry} /> : null}
        </div>
      </div>

      <Composer
        centered={isEmpty}
        disabled={conversationId === null}
        busy={loading}
        cwd={conversation?.cwd ?? null}
        attachments={attachments.paths}
        notice={attachments.notice}
        model={model}
        effort={effort}
        onSubmit={submit}
        onCancel={() => void cancel()}
        onAttach={() => void pickFiles()}
        onRemoveAttachment={attachments.remove}
        onDismissNotice={attachments.dismissNotice}
        onModelChange={setModel}
        onEffortChange={setEffort}
      />

      {dragging ? <DropOverlay /> : null}
    </section>
  )
}

/** Covers the pane while a drag is over it, so the target is unmistakable. */
function DropOverlay(): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-accent bg-[color-mix(in_oklch,var(--c-accent)_10%,transparent)] backdrop-blur-[2px]">
      <p className="flex items-center gap-2 font-mono text-[length:var(--text-meta)] text-accent">
        <Paperclip aria-hidden className="size-4" />
        Drop to attach
      </p>
    </div>
  )
}

interface EmptyStateProps {
  readonly appVersion: string | null
}

/**
 * The one line the app leads with: mark, question, build. Everything else the
 * first-time reader needs is already in the composer sitting under it.
 */
function EmptyState({ appVersion }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 pb-7">
      <ClaudeMark className="size-7 shrink-0 text-accent" />
      <h2 className="text-[length:var(--text-display)] leading-none font-medium tracking-tight text-ink">
        Start a session
      </h2>
      {appVersion ? (
        <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[length:var(--text-micro)] text-muted">
          v{appVersion}
        </span>
      ) : null}
    </div>
  )
}
