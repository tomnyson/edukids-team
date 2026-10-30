import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import type { Company, Conversation, EffortId, ModelId, Project } from '@shared/types'
import { useAttachments } from '@renderer/hooks/useAttachments'
import { useChatStream, type SendOptions } from '@renderer/hooks/useChatStream'
import { useCompanyChatStream } from '@renderer/hooks/useCompanyChatStream'
import { AppMark } from '@renderer/components/ui/AppMark'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { useSettings } from '@renderer/hooks/settingsContext'
import { botCount, modeName } from '@renderer/lib/team'
import { Composer } from './Composer'
import { PendingTurnView, Turn } from './Turn'
import { CompanyTurn, PendingCompanyTurnView } from './CompanyTurn'
import { ActiveSpeakerBar } from './ActiveSpeakerBar'
import { ChatHeader } from './ChatHeader'

interface ChatPaneProps {
  readonly conversation: Conversation | null
  /** The project the open chat belongs to, when it has one. */
  readonly project: Project | null
  readonly appVersion: string | null
  readonly railHidden: boolean
  readonly company?: Company | null
  readonly onToggleFunMode?: () => void
  readonly onShowRail: () => void
  readonly onOpenCompany: () => void
  readonly onConversationChanged: () => void
}

export function ChatPane({
  conversation,
  project,
  appVersion,
  railHidden,
  company,
  onToggleFunMode,
  onShowRail,
  onOpenCompany,
  onConversationChanged
}: ChatPaneProps): React.JSX.Element {
  const conversationId = conversation?.id ?? null
  const isCompanyMode = Boolean(company)

  const claudeStream = useChatStream(isCompanyMode ? null : conversationId, onConversationChanged)

  const companyStream = useCompanyChatStream(isCompanyMode ? conversationId : null, company ?? null)

  const messages = isCompanyMode ? [] : claudeStream.messages
  const pending = isCompanyMode ? null : claudeStream.pending
  const loading = isCompanyMode ? companyStream.busy : claudeStream.loading
  const error = isCompanyMode ? companyStream.error : claudeStream.error
  const dismissError = isCompanyMode ? companyStream.dismissError : claudeStream.dismissError

  const attachments = useAttachments()
  const { settings } = useSettings()
  // Seeded from the last turn because the pane remounts per conversation; a
  // conversation that never chose one falls back to its project's default, and
  // then to the global one.
  const [model, setModel] = useState<ModelId | null>(
    conversation?.lastModel ?? project?.defaultModel ?? settings.defaultModel
  )
  const [effort, setEffort] = useState<EffortId | null>(
    conversation?.lastEffort ?? project?.defaultEffort ?? settings.defaultEffort
  )
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
      if (isCompanyMode) {
        pinnedToBottom.current = true
        clear()
        void companyStream.send(prompt)
        return
      }
      const options: SendOptions = { model, effort, attachments: paths }
      lastSentRef.current = { prompt, options }
      pinnedToBottom.current = true
      clear()
      void claudeStream.send(prompt, options)
    },
    [clear, effort, model, paths, claudeStream, companyStream, isCompanyMode]
  )

  const retry = useCallback(() => {
    if (isCompanyMode) return
    const last = lastSentRef.current
    if (!last) return
    dismissError()
    void claudeStream.send(last.prompt, last.options)
  }, [dismissError, claudeStream, isCompanyMode])

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

  const isEmpty = isCompanyMode
    ? companyStream.messages.length === 0 && !companyStream.pending
    : messages.length === 0 && !pending
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
      <ChatHeader
        conversation={conversation}
        company={company ?? null}
        railHidden={railHidden}
        onShowRail={onShowRail}
        onOpenCompany={onOpenCompany}
      />

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
          {isEmpty ? <EmptyState appVersion={appVersion} company={company ?? null} /> : null}

          {isCompanyMode ? (
            <>
              {companyStream.messages.map((message) => (
                <CompanyTurn key={message.id} message={message} />
              ))}

              {companyStream.pending ? (
                <PendingCompanyTurnView pending={companyStream.pending} />
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}

          {error ? <ErrorNotice error={error} onDismiss={dismissError} onRetry={retry} /> : null}
        </div>
      </div>

      {isCompanyMode && (
        <ActiveSpeakerBar
          activeSpeaker={companyStream.activeSpeaker}
          phaseDescription={companyStream.phaseDescription}
          onStop={companyStream.stop}
        />
      )}

      <Composer
        centered={isEmpty}
        disabled={conversationId === null}
        busy={loading}
        cwd={conversation?.cwd ?? null}
        attachments={attachments.paths}
        notice={attachments.notice}
        model={model}
        effort={effort}
        company={company}
        onToggleFunMode={onToggleFunMode}
        onSubmit={submit}
        onCancel={isCompanyMode ? companyStream.stop : () => void claudeStream.cancel()}
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
    <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[var(--radius-2xl)] border-2 border-dashed border-accent bg-[color-mix(in_oklch,var(--c-accent)_10%,transparent)] backdrop-blur-[2px]">
      <p className="flex items-center gap-2 text-[length:var(--text-ui)] font-medium text-accent">
        <Paperclip aria-hidden className="size-4" />
        Drop to attach
      </p>
    </div>
  )
}

interface EmptyStateProps {
  readonly appVersion: string | null
  readonly company: Company | null
}

/**
 * The one thing the app leads with: the mark, and who is listening. Everything
 * else the first-time reader needs is already in the composer sitting under it.
 */
function EmptyState({ appVersion, company }: EmptyStateProps): React.JSX.Element {
  const detail = company
    ? `${botCount(company)} in a ${modeName(company).toLowerCase()}`
    : 'Solo session with Claude'

  return (
    <div className="flex flex-col items-center gap-4 pb-8 text-center">
      <AppMark className="size-14 text-ink" />
      <div className="space-y-1.5">
        <h2 className="text-[length:var(--text-display)] leading-tight font-semibold tracking-tight text-ink">
          {company ? `What should ${company.name} work on?` : 'What should we work on?'}
        </h2>
        <p className="flex items-center justify-center gap-2 text-[length:var(--text-ui)] text-muted">
          {detail}
          {appVersion ? (
            <span className="rounded-[var(--radius-pill)] bg-surface px-2 py-0.5 text-[length:var(--text-micro)] text-faint tabular-nums">
              v{appVersion}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
