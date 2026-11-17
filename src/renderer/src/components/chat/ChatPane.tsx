import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import type { Company, Conversation, EffortId, ModelId, Project, ProviderId } from '@shared/types'
import { directMember } from '@shared/direct-chat'
import { useAttachments } from '@renderer/hooks/useAttachments'
import { useChatStream } from '@renderer/hooks/useChatStream'
import { useCompanyChatStream } from '@renderer/hooks/useCompanyChatStream'
import { useSearchMode } from '@renderer/hooks/useSearchMode'
import { useProposals } from '@renderer/hooks/useProposals'
import { useOfficePrefs } from '@renderer/hooks/useOfficePrefs'
import { useOfficeState } from '@renderer/hooks/useOfficeState'
import { ViewToggle } from '@renderer/components/office/ViewToggle'
import { usePromptQueue } from '@renderer/hooks/usePromptQueue'
import {
  canRetry,
  findSent,
  rememberSent,
  type SendOptions,
  type SentPrompt
} from '@renderer/lib/queueView'
import { AppMark } from '@renderer/components/ui/AppMark'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { useSettings } from '@renderer/hooks/settingsContext'
import { botCount, isDirectChat, modeName } from '@renderer/lib/team'
import { Composer } from './Composer'
import { PendingTurnView, Turn } from './Turn'
import { CompanyTurn, PendingCompanyTurnView } from './CompanyTurn'
import { ProposalCard } from './ProposalCard'
import { ActiveSpeakerBar } from './ActiveSpeakerBar'
import { QueuedPrompts } from './QueuedPrompts'
import { ChatHeader } from './ChatHeader'

// three.js is large; it is only fetched the first time someone opens the office
const OfficeView = lazy(() => import('@renderer/components/office/OfficeView'))

interface ChatPaneProps {
  readonly conversation: Conversation | null
  /** The project the open chat belongs to, when it has one. */
  readonly project: Project | null
  readonly appVersion: string | null
  readonly railHidden: boolean
  readonly company?: Company | null
  readonly onToggleFunMode?: () => void
  readonly onDirectModelChange?: (memberId: number, provider: ProviderId, modelId: string) => void
  readonly onShowRail: () => void
  readonly onOpenCompany: () => void
  readonly onConversationChanged: () => void
  /** A proposed member was approved, so the team has one more. */
  readonly onTeamChanged: () => void
}

export function ChatPane({
  conversation,
  project,
  appVersion,
  railHidden,
  company,
  onToggleFunMode,
  onDirectModelChange,
  onShowRail,
  onOpenCompany,
  onConversationChanged,
  onTeamChanged
}: ChatPaneProps): React.JSX.Element {
  const conversationId = conversation?.id ?? null
  const isCompanyMode = Boolean(company)

  const claudeStream = useChatStream(isCompanyMode ? null : conversationId, onConversationChanged)

  const companyStream = useCompanyChatStream(isCompanyMode ? conversationId : null, company ?? null)
  const team = useProposals(isCompanyMode ? conversationId : null, onTeamChanged)
  const [officePrefs, setOfficePrefs] = useOfficePrefs()
  // Listened to in either view, so the office is already current when it is opened mid-meeting
  const office = useOfficeState(isCompanyMode ? conversationId : null)

  // Busy means something runs in this conversation, even a prompt sent before this pane mounted
  const queue = usePromptQueue(isCompanyMode ? 'company' : 'solo', conversationId)

  const messages = isCompanyMode ? [] : claudeStream.messages
  const pending = isCompanyMode ? null : claudeStream.pending
  const loading = queue.busy
  const error = isCompanyMode ? companyStream.error : claudeStream.error
  const dismissError = isCompanyMode ? companyStream.dismissError : claudeStream.dismissError

  const attachments = useAttachments()
  const { settings } = useSettings()
  // Any team has an office, a direct chat's single model included; solo Claude has no members.
  // Settings → Appearance can switch the whole view off.
  const hasOffice = Boolean(company) && settings.office3d
  const showOffice = hasOffice && officePrefs.view === 'office'
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
  // What each queued prompt was sent with, so a failed one is retried as it was sent
  const [sentLog, setSentLog] = useState<readonly SentPrompt[]>([])
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
  const [searchMode, setSearchMode] = useSearchMode(conversationId)
  const searchable = isDirectChat(company ?? null)

  /** Queues the prompt; attachments are let go only once the main process took them. */
  const submit = useCallback(
    async (prompt: string): Promise<boolean> => {
      pinnedToBottom.current = true
      if (isCompanyMode) {
        // Only a direct chat searches; a meeting's prompt always goes as it is
        const accepted = await companyStream.send(prompt, searchable ? searchMode : 'off')
        if (accepted) clear()
        return accepted
      }
      const options: SendOptions = { model, effort, attachments: paths }
      const accepted = await claudeStream.submit(prompt, options)
      if (accepted) {
        setSentLog((log) => rememberSent(log, { prompt, options }))
        clear()
      }
      return accepted
    },
    [clear, effort, model, paths, claudeStream, companyStream, isCompanyMode, searchable, searchMode]
  )

  const failedSend = isCompanyMode ? null : findSent(sentLog, claudeStream.failedPrompt)
  const retryable = canRetry(failedSend, queue.paused, queue.waiting.length)

  const retry = useCallback(async (): Promise<void> => {
    if (!failedSend) return
    dismissError()
    pinnedToBottom.current = true
    const accepted = await claudeStream.submit(failedSend.prompt, failedSend.options)
    if (accepted) setSentLog((log) => rememberSent(log, failedSend))
  }, [dismissError, claudeStream, failedSend])

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
        viewToggle={
          hasOffice ? (
            <ViewToggle view={officePrefs.view} onChange={(view) => setOfficePrefs({ view })} />
          ) : null
        }
      />

      {showOffice && company ? (
        <Suspense fallback={<div className="min-h-0 flex-1" aria-busy="true" />}>
          <OfficeView
            company={company}
            office={office}
            proposals={team.proposals}
            prefs={officePrefs}
            onPrefsChange={setOfficePrefs}
          />
        </Suspense>
      ) : null}
      {showOffice && error ? (
        <div className="px-6 pb-2">
          <ErrorNotice error={error} onDismiss={dismissError} />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        // Hidden rather than unmounted, so the transcript keeps its scroll position
        hidden={showOffice}
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
                <Fragment key={message.id}>
                  <CompanyTurn message={message} />
                  {team.proposals
                    .filter((proposal) => proposal.messageId === message.id)
                    .map((proposal) => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        onApprove={team.approve}
                        onReject={team.reject}
                      />
                    ))}
                </Fragment>
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

          {error ? (
            <ErrorNotice
              error={error}
              onDismiss={dismissError}
              onRetry={retryable ? () => void retry() : undefined}
            />
          ) : null}
        </div>
      </div>

      {isCompanyMode && (
        <ActiveSpeakerBar
          activeSpeaker={companyStream.activeSpeaker}
          phaseDescription={companyStream.phaseDescription}
          onStop={companyStream.stop}
        />
      )}

      <QueuedPrompts
        waiting={queue.waiting}
        paused={queue.paused}
        error={queue.error}
        onRemove={(itemId) => void queue.remove(itemId)}
        onResume={() => void queue.resume()}
        onClear={() => void queue.clear()}
        onDismissError={queue.dismissError}
      />

      <Composer
        centered={isEmpty && !showOffice}
        disabled={conversationId === null}
        busy={loading}
        cwd={conversation?.cwd ?? null}
        attachments={attachments.paths}
        notice={attachments.notice}
        model={model}
        effort={effort}
        company={company}
        onToggleFunMode={onToggleFunMode}
        onDirectModelChange={onDirectModelChange}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
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

/** Who is listening: the one model of a direct chat, or the size and style of the meeting. */
function teamDetail(company: Company): string {
  const model = isDirectChat(company) ? directMember(company) : null
  return model
    ? `Direct chat with ${model.modelId}`
    : `${botCount(company)} in a ${modeName(company).toLowerCase()}`
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
  const detail = company ? teamDetail(company) : 'Solo session with Claude'

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
