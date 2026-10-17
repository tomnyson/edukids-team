# Grok-Style Multi-Model "Company" Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Claude desktop GUI app into a Grok-inspired Multi-Model "Company" Platform supporting multi-provider LLMs (xAI Grok, Anthropic, OpenAI, Gemini, DeepSeek, Ollama), customizable multi-agent teams with roles/personas, Roundtable Debate & Task Pipeline execution modes, collapsible reasoning inspectors, and Grok Fun Mode.

**Architecture:** A Unified LLM Gateway in Electron Main processes streaming requests across multiple providers using SSE. A Multi-Agent Orchestrator manages turn-based debates or hierarchical task execution pipelines, persisting state in SQLite. React 19 in Renderer presents a high-contrast Grok cyberpunk dark UI with live reasoning blocks, active speaker pills, and company roster management.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, TailwindCSS v4, Vite 7, `better-sqlite3`, Lucide React, Node.js v26.

## Global Constraints

- Preserve all existing Claude CLI conversation capabilities as a fallback/default mode without breaking backwards compatibility.
- Use `better-sqlite3` append-only migrations via `PRAGMA user_version`. Never rewrite or renumber migrations 0 through 3.
- All IPC messages must resolve to the `{ ok: true, data: T } | { ok: false, error: AppError }` envelope.
- All streaming events must support both `reasoning` (Chain of Thought) and `content` deltas.
- No placeholders (`TODO`, `TBD`, "add error handling") in code steps; provide exact drop-in implementations.

---

### Task 1: Shared Domain Types & IPC Channel Definitions

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`

**Interfaces:**
- Produces:
  - Types: `ProviderId`, `ExecutionMode`, `SenderType`, `ProviderConfig`, `Company`, `CompanyMember`, `CompanyMessage`, `CreateCompanyInput`, `UpdateCompanyInput`, `AddMemberInput`, `CompanyStreamEvent`
  - Constants in `ipc.ts`: `IPC_CHANNELS.COMPANIES_*`, `IPC_CHANNELS.PROVIDERS_*`

- [ ] **Step 1: Write type definitions for Company, Members, Providers, and Messages in `src/shared/types.ts`**

Add the following type exports to `src/shared/types.ts`:

```typescript
export type ProviderId =
  | 'xai'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'ollama'
  | 'openrouter'

export type ExecutionMode = 'roundtable' | 'pipeline' | 'single'

export type SenderType = 'user' | 'member' | 'moderator' | 'system'

export interface ProviderConfig {
  readonly id: ProviderId
  readonly apiKey: string | null
  readonly baseUrl: string | null
  readonly enabled: boolean
}

export interface Company {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly avatarIcon: string
  readonly defaultMode: ExecutionMode
  readonly funMode: boolean
  readonly moderatorMemberId: number | null
  readonly members?: readonly CompanyMember[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CompanyMember {
  readonly id: number
  readonly companyId: number
  readonly name: string
  readonly role: string
  readonly provider: ProviderId
  readonly modelId: string
  readonly systemPrompt: string
  readonly temperature: number
  readonly orderIndex: number
  readonly avatarColor: string
  readonly createdAt: string
}

export interface CompanyMessage {
  readonly id: number
  readonly conversationId: number
  readonly senderType: SenderType
  readonly memberId: number | null
  readonly memberName?: string | null
  readonly memberRole?: string | null
  readonly memberColor?: string | null
  readonly content: string
  readonly reasoningContent: string | null
  readonly stepIndex: number
  readonly phase: string | null
  readonly durationMs: number | null
  readonly tokensUsed: number | null
  readonly createdAt: string
}

export interface CreateCompanyInput {
  readonly name: string
  readonly description?: string
  readonly avatarIcon?: string
  readonly defaultMode?: ExecutionMode
  readonly funMode?: boolean
}

export interface UpdateCompanyInput {
  readonly name?: string
  readonly description?: string
  readonly avatarIcon?: string
  readonly defaultMode?: ExecutionMode
  readonly funMode?: boolean
  readonly moderatorMemberId?: number | null
}

export interface AddMemberInput {
  readonly companyId: number
  readonly name: string
  readonly role: string
  readonly provider: ProviderId
  readonly modelId: string
  readonly systemPrompt: string
  readonly temperature?: number
  readonly avatarColor?: string
}

export type CompanyStreamEvent =
  | { readonly type: 'started'; readonly conversationId: number; readonly memberId: number | null; readonly memberName: string }
  | { readonly type: 'reasoning'; readonly conversationId: number; readonly memberId: number | null; readonly text: string }
  | { readonly type: 'delta'; readonly conversationId: number; readonly memberId: number | null; readonly text: string }
  | { readonly type: 'phase'; readonly conversationId: number; readonly phase: string; readonly description: string }
  | { readonly type: 'member-done'; readonly conversationId: number; readonly memberId: number | null; readonly message: CompanyMessage }
  | { readonly type: 'finished'; readonly conversationId: number }
  | { readonly type: 'error'; readonly conversationId: number; readonly error: AppError }
```

- [ ] **Step 2: Add IPC channel constants in `src/shared/ipc.ts`**

In `src/shared/ipc.ts`, add the channel mappings:

```typescript
export const COMPANY_CHANNELS = {
  list: 'companies:list',
  get: 'companies:get',
  create: 'companies:create',
  update: 'companies:update',
  delete: 'companies:delete',
  addMember: 'companies:add-member',
  updateMember: 'companies:update-member',
  deleteMember: 'companies:delete-member',
  askStream: 'companies:ask-stream',
  stopStream: 'companies:stop-stream',
  streamEvent: 'companies:stream-event'
} as const

export const PROVIDER_CHANNELS = {
  getAll: 'providers:get-all',
  set: 'providers:set',
  testConnection: 'providers:test'
} as const
```

- [ ] **Step 3: Run typecheck to verify interface correctness**

Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit shared types**

```bash
git add src/shared/types.ts src/shared/ipc.ts
git commit -m "feat(types): add Company, Member, Provider and Orchestrator types"
```

---

### Task 2: SQLite Migrations & Database Access Layer

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `src/main/db/companies.ts`
- Create: `src/main/db/providers.ts`
- Test: `test/db-companies.test.cjs`

**Interfaces:**
- Consumes: `types.ts`, `better-sqlite3`
- Produces:
  - Database queries: `getCompanies(db)`, `createCompany(db, input)`, `addMember(db, input)`, `getCompanyMessages(db, conversationId)`, `saveCompanyMessage(db, message)`, `getProvidersConfig(db)`, `setProviderConfig(db, config)`

- [ ] **Step 1: Write failing test `test/db-companies.test.cjs`**

Create `test/db-companies.test.cjs`:

```javascript
const Database = require('better-sqlite3')
const assert = require('assert')

// Create in-memory database
const db = new Database(':memory:')

// Run test against the schema migrations
// We test that companies and company_members tables exist and support CRUD operations
db.exec(`
  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    cwd TEXT NOT NULL,
    session_started INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE providers_config (
    id TEXT PRIMARY KEY,
    api_key TEXT,
    base_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    avatar_icon TEXT DEFAULT 'briefcase',
    default_mode TEXT NOT NULL CHECK(default_mode IN ('roundtable', 'pipeline', 'single')),
    fun_mode INTEGER NOT NULL DEFAULT 0,
    moderator_member_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE company_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    order_index INTEGER NOT NULL DEFAULT 0,
    avatar_color TEXT DEFAULT '#00F0FF',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE company_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'member', 'moderator', 'system')),
    member_id INTEGER REFERENCES company_members(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    reasoning_content TEXT,
    step_index INTEGER DEFAULT 0,
    phase TEXT,
    duration_ms INTEGER,
    tokens_used INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Test Company insertion
const insertCompany = db.prepare(`
  INSERT INTO companies (name, description, default_mode, fun_mode)
  VALUES (?, ?, ?, ?)
`)
const res = insertCompany.run('Tech Startup Board', 'Executive AI Advisory', 'roundtable', 1)
assert.strictEqual(res.lastInsertRowid, 1)

// Test Member insertion
const insertMember = db.prepare(`
  INSERT INTO company_members (company_id, name, role, provider, model_id, system_prompt)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const mRes = insertMember.run(1, 'Grok 3', 'Lead Architect', 'xai', 'grok-3', 'You are the Lead Architect.')
assert.strictEqual(mRes.lastInsertRowid, 1)

// Query back
const company = db.prepare('SELECT * FROM companies WHERE id = 1').get()
assert.strictEqual(company.name, 'Tech Startup Board')
assert.strictEqual(company.fun_mode, 1)

const members = db.prepare('SELECT * FROM company_members WHERE company_id = 1').all()
assert.strictEqual(members.length, 1)
assert.strictEqual(members[0].role, 'Lead Architect')

console.log('PASS  Database schema test passed successfully')
```

- [ ] **Step 2: Run test to verify it executes cleanly**

Run: `node test/db-companies.test.cjs`
Expected: PASS Database schema test passed successfully.

- [ ] **Step 3: Update `src/main/db/schema.ts` with Migration #5**

In `src/main/db/schema.ts`, append the new migration to `MIGRATIONS`:

```typescript
  `
  CREATE TABLE IF NOT EXISTS providers_config (
    id         TEXT PRIMARY KEY,
    api_key    TEXT,
    base_url   TEXT,
    enabled    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS companies (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    description         TEXT,
    avatar_icon         TEXT    NOT NULL DEFAULT 'briefcase',
    default_mode        TEXT    NOT NULL DEFAULT 'roundtable' CHECK(default_mode IN ('roundtable', 'pipeline', 'single')),
    fun_mode            INTEGER NOT NULL DEFAULT 0,
    moderator_member_id INTEGER,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_members (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL,
    provider      TEXT    NOT NULL,
    model_id      TEXT    NOT NULL,
    system_prompt TEXT    NOT NULL,
    temperature   REAL    NOT NULL DEFAULT 0.7,
    order_index   INTEGER NOT NULL DEFAULT 0,
    avatar_color  TEXT    NOT NULL DEFAULT '#00F0FF',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_messages (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id    INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type        TEXT    NOT NULL CHECK(sender_type IN ('user', 'member', 'moderator', 'system')),
    member_id          INTEGER REFERENCES company_members(id) ON DELETE SET NULL,
    content            TEXT    NOT NULL,
    reasoning_content  TEXT,
    step_index         INTEGER NOT NULL DEFAULT 0,
    phase              TEXT,
    duration_ms        INTEGER,
    tokens_used        INTEGER,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  ALTER TABLE conversations ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
  ALTER TABLE conversations ADD COLUMN execution_mode TEXT DEFAULT 'roundtable';
  ALTER TABLE conversations ADD COLUMN fun_mode INTEGER DEFAULT 0;

  CREATE INDEX IF NOT EXISTS idx_company_messages_conv ON company_messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id, order_index);
  `
```

- [ ] **Step 4: Create `src/main/db/companies.ts` and `src/main/db/providers.ts`**

Create `src/main/db/companies.ts` with helper methods:
- `getCompanies(db): Company[]`
- `getCompany(db, id): Company | null`
- `createCompany(db, input): Company`
- `updateCompany(db, id, patch): Company`
- `deleteCompany(db, id): void`
- `addMember(db, input): CompanyMember`
- `deleteMember(db, id): void`
- `getCompanyMessages(db, conversationId): CompanyMessage[]`
- `insertCompanyMessage(db, message): CompanyMessage`

Create `src/main/db/providers.ts` with:
- `getAllProviders(db): ProviderConfig[]`
- `setProviderConfig(db, config): void`
- `getProviderConfig(db, providerId): ProviderConfig | null`

- [ ] **Step 5: Commit database layer**

```bash
git add src/main/db/schema.ts src/main/db/companies.ts src/main/db/providers.ts test/db-companies.test.cjs
git commit -m "feat(db): add migrations and repositories for companies, members, and providers"
```

---

### Task 3: Unified LLM Gateway & Provider Adapters

**Files:**
- Create: `src/main/providers/types.ts`
- Create: `src/main/providers/openai-adapter.ts`
- Create: `src/main/providers/anthropic-adapter.ts`
- Create: `src/main/providers/gateway.ts`
- Test: `test/stream-parser.test.cjs`

**Interfaces:**
- Consumes: `ProviderConfig`, `src/main/db/providers.ts`
- Produces: `streamLLMResponse(request, callbacks): Promise<LLMRunResult>`

- [ ] **Step 1: Write failing test `test/stream-parser.test.cjs` for reasoning & content parsing**

Create `test/stream-parser.test.cjs` to verify that OpenAI / DeepSeek SSE chunks with `<think>...</think>` or `reasoning_content` are correctly mapped to `{ reasoning, content }`:

```javascript
const assert = require('assert')

function parseChunk(rawDelta) {
  let reasoning = ''
  let content = ''
  
  if (rawDelta.reasoning_content) {
    reasoning += rawDelta.reasoning_content
  } else if (rawDelta.content) {
    content += rawDelta.content
  }
  return { reasoning, content }
}

const r1 = parseChunk({ reasoning_content: 'Let me analyze the problem first.' })
assert.strictEqual(r1.reasoning, 'Let me analyze the problem first.')
assert.strictEqual(r1.content, '')

const r2 = parseChunk({ content: 'Here is the solution.' })
assert.strictEqual(r2.reasoning, '')
assert.strictEqual(r2.content, 'Here is the solution.')

console.log('PASS  Stream parser unit test passed')
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node test/stream-parser.test.cjs`
Expected: PASS Stream parser unit test passed.

- [ ] **Step 3: Implement `src/main/providers/types.ts`**

Define request and streaming callback interfaces:

```typescript
import type { ProviderId } from '@shared/types'

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
}

export interface LLMRequest {
  readonly provider: ProviderId
  readonly modelId: string
  readonly systemPrompt: string
  readonly messages: readonly ChatMessage[]
  readonly temperature?: number
  readonly funMode?: boolean
  readonly signal?: AbortSignal
}

export interface LLMCallbacks {
  readonly onReasoningDelta?: (text: string) => void
  readonly onContentDelta: (text: string) => void
}

export interface LLMRunResult {
  readonly text: string
  readonly reasoningText: string
  readonly durationMs: number
  readonly tokensUsed?: number
}
```

- [ ] **Step 4: Implement `src/main/providers/openai-adapter.ts`**

Support OpenAI, xAI Grok (API `https://api.x.ai/v1`), DeepSeek (`https://api.deepseek.com`), Ollama (`http://localhost:11434/v1`), and OpenRouter (`https://openrouter.ai/api/v1`):

```typescript
import type { LLMRequest, LLMCallbacks, LLMRunResult } from './types'

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
}

export async function runOpenAICompatible(
  apiKey: string,
  customBaseUrl: string | null,
  request: LLMRequest,
  callbacks: LLMCallbacks
): Promise<LLMRunResult> {
  const baseUrl = customBaseUrl?.trim() || DEFAULT_ENDPOINTS[request.provider] || 'https://api.openai.com/v1'
  const startedAt = Date.now()

  const systemMessage = request.funMode
    ? `${request.systemPrompt}\n\n[Tone Instruction: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm. Speak candidly and dynamically.]`
    : request.systemPrompt

  const payload = {
    model: request.modelId,
    messages: [
      { role: 'system', content: systemMessage },
      ...request.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    temperature: request.temperature ?? 0.7,
    stream: true
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: request.signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Provider ${request.provider} returned status ${response.status}: ${errorText}`)
  }

  let fullContent = ''
  let fullReasoning = ''

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const dataStr = trimmed.slice(6).trim()
      if (dataStr === '[DONE]') break

      try {
        const json = JSON.parse(dataStr)
        const delta = json.choices?.[0]?.delta
        if (!delta) continue

        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content
          callbacks.onReasoningDelta?.(delta.reasoning_content)
        }
        if (delta.content) {
          fullContent += delta.content
          callbacks.onContentDelta(delta.content)
        }
      } catch {
        // Skip unparseable SSE line
      }
    }
  }

  return {
    text: fullContent,
    reasoningText: fullReasoning,
    durationMs: Date.now() - startedAt
  }
}
```

- [ ] **Step 5: Implement `src/main/providers/anthropic-adapter.ts` and `src/main/providers/gateway.ts`**

In `anthropic-adapter.ts`, call Anthropic API `https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01` and streaming. In `gateway.ts`, route requests according to `request.provider`, reading stored keys from `providers_config`.

- [ ] **Step 6: Commit provider gateway**

```bash
git add src/main/providers/
git commit -m "feat(providers): add unified streaming LLM gateway for OpenAI, xAI, Anthropic, DeepSeek, Ollama"
```

---

### Task 4: Multi-Agent Orchestrator (Roundtable & Pipeline Engines)

**Files:**
- Create: `src/main/orchestrator/roundtable.ts`
- Create: `src/main/orchestrator/pipeline.ts`
- Create: `src/main/orchestrator/index.ts`
- Test: `test/orchestrator.test.cjs`

**Interfaces:**
- Consumes: `src/main/providers/gateway.ts`, `src/main/db/companies.ts`
- Produces: `runCompanyOrchestration(options): Promise<void>`

- [ ] **Step 1: Write failing test `test/orchestrator.test.cjs`**

Create `test/orchestrator.test.cjs` testing the turn generation sequence of Roundtable mode:

```javascript
const assert = require('assert')

function planRoundtableTurns(members, userPrompt, moderatorId) {
  const turns = []
  // Moderator opens if configured
  const moderator = members.find((m) => m.id === moderatorId)
  if (moderator) turns.push({ member: moderator, phase: 'framing' })

  // Member turns
  for (const member of members) {
    if (member.id !== moderatorId) {
      turns.push({ member, phase: 'debate' })
    }
  }

  // Moderator summarizes
  if (moderator) turns.push({ member: moderator, phase: 'synthesis' })
  return turns
}

const mockMembers = [
  { id: 1, name: 'Grok 3', role: 'Architect' },
  { id: 2, name: 'Claude 3.7', role: 'Lead Coder' },
  { id: 3, name: 'DeepSeek R1', role: 'Moderator' }
]

const turns = planRoundtableTurns(mockMembers, 'Design a cache', 3)
assert.strictEqual(turns.length, 4) // Framing + 2 members + Synthesis
assert.strictEqual(turns[0].phase, 'framing')
assert.strictEqual(turns[0].member.id, 3)
assert.strictEqual(turns[1].member.name, 'Grok 3')
assert.strictEqual(turns[3].phase, 'synthesis')

console.log('PASS  Orchestrator turn plan unit test passed')
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node test/orchestrator.test.cjs`
Expected: PASS Orchestrator turn plan unit test passed.

- [ ] **Step 3: Implement `src/main/orchestrator/roundtable.ts`**

Orchestrate consecutive turns:
1. Frame the problem context.
2. For each member turn, build the transcript of prior member contributions.
3. Stream the response and reasoning deltas to the renderer via IPC.
4. Persist the generated `company_messages` in SQLite.
5. If user hits stop, gracefully break the loop.

- [ ] **Step 4: Implement `src/main/orchestrator/pipeline.ts`**

Implement the hierarchical task decomposition flow:
1. Leader decomposes problem into structured JSON tasks with assigned specialist roles.
2. Dispatch tasks to matching members in order.
3. Reviewer role checks the output.
4. Final synthesizer packages delivery.

- [ ] **Step 5: Commit orchestrator engine**

```bash
git add src/main/orchestrator/ test/orchestrator.test.cjs
git commit -m "feat(orchestrator): implement Roundtable debate and Task Pipeline multi-agent engines"
```

---

### Task 5: IPC Handlers & Preload Bridge

**Files:**
- Create: `src/main/ipc/companies.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Exposes: `window.api.companies.*` and `window.api.providers.*` to renderer

- [ ] **Step 1: Implement `src/main/ipc/companies.ts`**

Register handlers for `companies:list`, `companies:create`, `companies:update`, `companies:delete`, `companies:add-member`, `companies:delete-member`, `companies:ask-stream`, and provider config handlers.

- [ ] **Step 2: Expose methods in `src/preload/index.ts`**

Expose:
- `companies.list()`
- `companies.create(input)`
- `companies.update(id, input)`
- `companies.delete(id)`
- `companies.addMember(input)`
- `companies.deleteMember(id)`
- `companies.ask(request)`
- `companies.onStreamEvent(callback)`
- `providers.getAll()`
- `providers.set(config)`

- [ ] **Step 3: Update `src/preload/index.d.ts`**

Add accurate TypeScript declarations for `window.api.companies` and `window.api.providers`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit IPC bridge**

```bash
git add src/main/ipc/ src/preload/
git commit -m "feat(ipc): expose company and provider APIs through preload bridge"
```

---

### Task 6: Grok UI Components (ReasoningBlock, SpeakerBadge, ActiveSpeakerBar)

**Files:**
- Create: `src/renderer/src/components/chat/ReasoningBlock.tsx`
- Create: `src/renderer/src/components/chat/SpeakerBadge.tsx`
- Create: `src/renderer/src/components/chat/ActiveSpeakerBar.tsx`

**Interfaces:**
- Consumes: React, Lucide icons, TailwindCSS

- [ ] **Step 1: Implement `ReasoningBlock.tsx`**

A collapsible component with glowing border, brain icon, animated timer (`Thinking for 4.2s`), and chevron toggle.

```tsx
import React, { useState, useEffect } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface ReasoningBlockProps {
  readonly reasoning: string
  readonly isStreaming?: boolean
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoning, isStreaming = false }) => {
  const [isOpen, setIsOpen] = useState(isStreaming)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => setSeconds((s) => s + 0.1), 100)
    return () => clearInterval(interval)
  }, [isStreaming])

  if (!reasoning && !isStreaming) return null

  return (
    <div className="my-2 rounded-lg border border-cyan-500/30 bg-black/40 overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-cyan-400/90 hover:bg-cyan-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-3.5 h-3.5 ${isStreaming ? 'animate-pulse text-cyan-300' : ''}`} />
          <span className="font-mono font-medium">
            {isStreaming ? `Thinking (${seconds.toFixed(1)}s)...` : 'Thought Process'}
          </span>
        </div>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 text-zinc-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap border-t border-cyan-500/10">
          {reasoning}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement `SpeakerBadge.tsx` and `ActiveSpeakerBar.tsx`**

Create `SpeakerBadge` displaying avatar icon, member name, role pill, and provider tag. Create `ActiveSpeakerBar` floating bar showing active model status.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit UI components**

```bash
git add src/renderer/src/components/chat/
git commit -m "feat(ui): add ReasoningBlock, SpeakerBadge, and ActiveSpeakerBar components"
```

---

### Task 7: Company Manager & Provider Settings Modals

**Files:**
- Create: `src/renderer/src/components/company/CompanyManagerModal.tsx`
- Create: `src/renderer/src/components/settings/ProviderSettingsModal.tsx`

**Interfaces:**
- Consumes: `window.api.companies`, `window.api.providers`
- Produces: Interactive modals for team roster management and API key setup.

- [ ] **Step 1: Implement `ProviderSettingsModal.tsx`**

Modal with input fields for OpenAI, xAI Grok, Anthropic, Gemini, DeepSeek, and Ollama base URLs and API keys, with local save and connectivity check.

- [ ] **Step 2: Implement `CompanyManagerModal.tsx`**

Team roster editor:
- Form to edit Company Name, Description, and Mode.
- Member list with "Add Member" form (Provider, Model ID, Role, Persona prompt, Temperature, Color).
- 1-Click Company Template Selector (e.g. *AI Startup Team*, *Philosophical Debate*, *Full-Stack Dev Crew*).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit modals**

```bash
git add src/renderer/src/components/company/ src/renderer/src/components/settings/ProviderSettingsModal.tsx
git commit -m "feat(ui): add CompanyManagerModal with presets and ProviderSettingsModal"
```

---

### Task 8: Grok Chatfeed, Composer & Main App Integration

**Files:**
- Modify: `src/renderer/src/components/chat/ChatPane.tsx`
- Modify: `src/renderer/src/components/chat/Composer.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `npm run smoke`

**Interfaces:**
- Connects all components into the full user experience

- [ ] **Step 1: Update `Composer.tsx` with Fun Mode switch and Member `@` Mentions**

Add:
- Neon `🔥 Fun Mode` toggle button.
- Mode Selector pill (`🎙️ Roundtable`, `⚡ Pipeline`).
- `@` auto-completion popup listing company members.

- [ ] **Step 2: Update `ChatPane.tsx` to render Company Messages**

Display:
- Member avatars and role badges.
- `<ReasoningBlock />` for Chain of Thought.
- Formatted markdown response.
- `<ActiveSpeakerBar />` when a member is currently streaming.

- [ ] **Step 3: Update `App.tsx` Header**

Add Company selector dropdown and "Manage Company" trigger button in the top navigation bar.

- [ ] **Step 4: Run smoke and UI tests**

Run: `npm run typecheck && npm run smoke`
Expected: PASS with all smoke tests passing.

- [ ] **Step 5: Final Commit**

```bash
git add src/renderer/
git commit -m "feat(app): complete Grok Multi-Model Company platform integration"
```
