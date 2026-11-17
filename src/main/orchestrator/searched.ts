import { directMember } from '@shared/direct-chat'
import { toCitations } from '@shared/citations'
import type { SearchMode } from '@shared/search'
import type { CompanyMember } from '@shared/types'
import { getCompanySummary, listCompanyMessages } from '../db/companies'
import { dispatchLLM } from '../providers/gateway'
import type { ChatMessage } from '../providers/types'
import { ANSWER_INSTRUCTION, REPORT_INSTRUCTION, withSources, type Source } from '../search/context'
import { openSearch, type SearchSession } from '../search/engine'
import { gatherSources } from '../search/gather'
import { SEARCH_LIMITS } from '../search/limits'
import {
  QUERY_SYSTEM_PROMPT,
  buildQueryMessages,
  fallbackQuery,
  parseQueries
} from '../search/queries'
import { getSettings } from '../settings/store'
import { memberErrorMessage } from './member-error'
import { streamMemberReply } from './reply'
import type { OrchestrationOptions } from './roundtable'
import { runSingle } from './single'
import { buildDirectMessages } from './single-chat'

interface Gathered {
  readonly sources: readonly Source[]
  /** The model said nothing needs looking up, before anything was searched. */
  readonly declined: boolean
  readonly tokens: number
}

const today = (): string => new Date().toISOString().slice(0, 10)

/** One quiet model call that returns search queries; nothing of it is shown or stored. */
async function askForQueries(
  options: OrchestrationOptions,
  member: CompanyMember,
  messages: readonly ChatMessage[]
): Promise<{ readonly queries: readonly string[] | null; readonly tokens: number }> {
  const result = await dispatchLLM(
    {
      provider: member.provider,
      modelId: member.modelId,
      systemPrompt: QUERY_SYSTEM_PROMPT,
      messages,
      temperature: member.temperature,
      signal: options.signal,
      executor: false
    },
    { onContentDelta: () => {} }
  ).catch((error: unknown) => {
    if (options.signal.aborted) throw error
    throw new Error(memberErrorMessage(member, error), { cause: error })
  })
  return { queries: parseQueries(result.text), tokens: result.tokensUsed ?? 0 }
}

/** Search rounds: ask what to look up, look it up, read it; repeat while something is missing. */
async function gather(
  options: OrchestrationOptions,
  member: CompanyMember,
  transcript: readonly ChatMessage[],
  search: SearchSession,
  rounds: number
): Promise<Gathered> {
  const { conversationId, userPrompt, signal, onEvent } = options
  const status = (description: string): void =>
    onEvent({ type: 'phase', conversationId, phase: 'search', description })

  let sources: readonly Source[] = []
  let tokens = 0

  for (let round = 0; round < rounds; round += 1) {
    status(round === 0 ? 'Working out what to search…' : 'Checking what is still missing…')
    const asked = await askForQueries(
      options,
      member,
      buildQueryMessages(transcript, today(), sources)
    )
    tokens += asked.tokens
    if (asked.queries === null) return { sources, declined: round === 0, tokens }

    // Only the first round falls back to the user's own words; later ones just stop
    const fallback = round === 0 ? [fallbackQuery(userPrompt)].filter(Boolean) : []
    const queries = asked.queries.length > 0 ? asked.queries : fallback
    if (queries.length === 0) break

    const found = await gatherSources({
      queries,
      search: search.search,
      read: search.read,
      maxPages: SEARCH_LIMITS.pagesPerRound,
      pageBudget: SEARCH_LIMITS.pageChars,
      firstIndex: sources.length + 1,
      seen: new Set(sources.map((source) => source.url)),
      signal,
      onStatus: status
    })
    if (found.length === 0) break
    sources = [...sources, ...found]
  }
  return { sources, declined: false, tokens }
}

/**
 * A direct chat's reply written from the live web: the model says what to look up, the app
 * searches and reads the pages, and the model answers from them with numbered citations.
 */
export async function runSearched(
  options: OrchestrationOptions,
  mode: Exclude<SearchMode, 'off'>
): Promise<void> {
  const { company, conversationId, signal, onEvent } = options
  const member = directMember(company)
  if (!member) throw new Error('This chat has no model configured.')
  if (signal.aborted) return

  const deep = mode === 'deep'
  const transcript = buildDirectMessages(
    listCompanyMessages(conversationId),
    getCompanySummary(conversationId)
  )

  onEvent({ type: 'started', conversationId, memberId: member.id, memberName: member.name })

  const search = openSearch(getSettings().search)
  let gathered: Gathered
  try {
    gathered = await gather(
      options,
      member,
      transcript,
      search,
      deep ? SEARCH_LIMITS.deepRounds : 1
    )
  } finally {
    // The hidden browser lives only as long as the pages are being read
    search.close()
  }

  // Nothing to look up: an ordinary reply, with the model's usual tools
  if (gathered.declined) return runSingle(options)
  if (gathered.sources.length === 0) {
    throw new Error('The search returned no results, so there was nothing to answer from.')
  }

  onEvent({
    type: 'phase',
    conversationId,
    phase: 'reply',
    description: `${member.name} is writing from ${gathered.sources.length} sources...`
  })

  await streamMemberReply(options, member, {
    systemPrompt: [
      member.systemPrompt,
      `Today is ${today()}.`,
      deep ? REPORT_INSTRUCTION : ANSWER_INSTRUCTION
    ].join('\n\n'),
    messages: withSources(
      transcript,
      gathered.sources,
      deep ? SEARCH_LIMITS.deepContextChars : SEARCH_LIMITS.searchContextChars
    ),
    // Web pages are untrusted text in this prompt, so the model gets no tools to act on them with
    executor: false,
    citations: toCitations(gathered.sources),
    tokensBefore: gathered.tokens
  })
}
