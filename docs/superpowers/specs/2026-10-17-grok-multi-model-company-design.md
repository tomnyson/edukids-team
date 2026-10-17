# Design Specification: Grok-Style Multi-Model "Company" Platform

- **Date:** 2026-10-17
- **Project:** Claude GUI / Desktop App -> Grok Multi-Model Company Platform
- **Status:** Approved by User

---

## 1. Executive Summary

This specification defines the transformation of the existing Claude desktop GUI application (`claude-app`) into a **Grok-inspired Multi-Model "Company" Platform**. 

The upgraded platform empowers users to:
1. Connect multiple LLM providers (xAI Grok, Anthropic Claude, OpenAI, Google Gemini, DeepSeek, OpenRouter, and local Ollama) as well as fallback to the local Claude CLI.
2. Assemble multiple AI models into a customizable **"Company"** (e.g., Tech Startup Team, Research Council, Debate Chamber, Creative Studio) with distinct roles, personas, system prompts, and priorities.
3. Collaborate in two distinct execution modes:
   - **Roundtable Debate Mode:** Turn-based discussions with multi-angle debates, dynamic member mentions (`@Member`), and moderator-led synthesis.
   - **Task Pipeline Mode:** Hierarchical problem-solving where a Leader/PM decomposes a task, delegates subtasks to specialist models, and performs cross-agent QA/review before final delivery.
4. Experience a high-energy, modern **Grok aesthetic** (dark cyberpunk palette, real-time collapsible thinking/reasoning inspector, live active speaker indicators, and a signature "Fun Mode" personality toggle).

---

## 2. System Architecture

The application retains its Electron + TypeScript + React foundation while decoupling the single-model Claude CLI execution into a modular multi-agent orchestration platform.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (React 19)                     │
│  - Grok Cyberpunk/Dark UI + Fun Mode Toggle                           │
│  - Company Roster Sidebar & Member Manager Modal                       │
│  - Chat Feed: Collapsible <ReasoningBlock/> + Member Badges + Avatars  │
│  - Mode Switcher: Single Model | Roundtable Debate | Task Pipeline     │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ (Typed Electron IPC)
┌─────────────────────────────────▼──────────────────────────────────────┐
│                         MAIN PROCESS (Node.js)                         │
│                                                                        │
│  ┌─────────────────────── Multi-Agent Orchestrator ──────────────────┐ │
│  │  - RoundtableEngine (Turn-based debate, Moderator synthesis)      │ │
│  │  - PipelineEngine (Task decomposition, Specialist dispatch, QA)    │ │
│  └──────────────────────────────────┬────────────────────────────────┘ │
│                                     │                                  │
│  ┌─────────────────────── Unified LLM Gateway ───────────────────────┐ │
│  │  - OpenAI-Compatible Adapter (OpenAI, xAI Grok, DeepSeek,         │ │
│  │    Ollama, OpenRouter)                                            │ │
│  │  - Anthropic Adapter (Messages API & Claude CLI fallback)         │ │
│  │  - Gemini Adapter (Google Generative AI)                          │ │
│  │  - Encrypted / Local Provider Settings Manager                    │ │
│  └──────────────────────────────────┬────────────────────────────────┘ │
│                                     │                                  │
│  ┌────────────────────── Local SQLite Database ──────────────────────┐ │
│  │  - companies & company_members                                    │ │
│  │  - conversations & messages (with reasoning CoT & phase markers)  │ │
│  │  - providers_config (API keys, custom endpoints)                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Updates (`better-sqlite3`)

Migrations are append-only. The existing `conversations` and `chat_history` tables are augmented, and new tables are introduced:

### 3.1. `providers_config`
Stores API credentials and endpoint configurations locally.
```sql
CREATE TABLE IF NOT EXISTS providers_config (
  id           TEXT PRIMARY KEY, -- 'openai' | 'anthropic' | 'xai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
  api_key      TEXT,
  base_url     TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2. `companies`
Stores company profiles and preset configurations.
```sql
CREATE TABLE IF NOT EXISTS companies (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  description         TEXT,
  avatar_icon         TEXT DEFAULT 'briefcase',
  default_mode        TEXT NOT NULL CHECK(default_mode IN ('roundtable', 'pipeline', 'single')),
  fun_mode            INTEGER NOT NULL DEFAULT 0,
  moderator_member_id INTEGER,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.3. `company_members`
Stores the agents/models that belong to a company.
```sql
CREATE TABLE IF NOT EXISTS company_members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL, -- e.g., 'Lead Architect', 'Senior Coder', 'Security QA', 'Critic'
  provider        TEXT NOT NULL, -- 'xai', 'anthropic', 'openai', 'gemini', 'deepseek', 'ollama', 'openrouter'
  model_id        TEXT NOT NULL, -- e.g., 'grok-3', 'claude-3-7-sonnet', 'gpt-4o', 'deepseek-r1'
  system_prompt   TEXT NOT NULL,
  temperature     REAL DEFAULT 0.7,
  order_index     INTEGER NOT NULL DEFAULT 0,
  avatar_color    TEXT DEFAULT '#00F0FF',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.4. `messages` (Enhanced message store replacing or extending `chat_history`)
```sql
ALTER TABLE conversations ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN execution_mode TEXT DEFAULT 'roundtable';
ALTER TABLE conversations ADD COLUMN fun_mode INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS company_messages (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id    INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type        TEXT NOT NULL CHECK(sender_type IN ('user', 'member', 'moderator', 'system')),
  member_id          INTEGER REFERENCES company_members(id) ON DELETE SET NULL,
  content            TEXT NOT NULL,
  reasoning_content  TEXT, -- Chain-of-thought (DeepSeek R1, Grok 3 reasoning, o3-mini)
  step_index         INTEGER DEFAULT 0,
  phase              TEXT, -- 'planning' | 'debate' | 'execution' | 'review' | 'synthesis'
  duration_ms        INTEGER,
  tokens_used        INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_company_messages_conv ON company_messages(conversation_id, id);
```

---

## 4. Multi-Agent Orchestration Engine

### 4.1. Unified LLM Gateway Interface
All providers are mapped to a single unified interface:
```typescript
export interface LLMRequest {
  provider: 'xai' | 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter';
  modelId: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  funMode?: boolean;
  signal?: AbortSignal;
}

export interface StreamCallbacks {
  onReasoningDelta?: (chunk: string) => void;
  onContentDelta: (chunk: string) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
}
```

### 4.2. Roundtable Debate Engine
- **Turn sequence:**
  1. User submits input.
  2. If Moderator is designated, Moderator emits initial scope framing and questions.
  3. Members take turns responding. When Member $N$ responds, its prompt context includes the full transcript of Member $1 \dots N-1$, instructed to evaluate previous ideas, offer critique, or introduce alternative technical paths.
  4. Mentions (`@MemberName`) give that member priority in the turn queue.
  5. The cycle completes after $K$ rounds or when the user triggers "Summarize Now" (Moderator synthesizes consensus and action items).

### 4.3. Task Pipeline Engine
- **Hierarchical workflow:**
  1. **Planning Phase:** Designated Leader (or first member) receives user goal and outputs structured tasks:
     ```json
     {
       "tasks": [
         { "id": 1, "assigneeRole": "Lead Architect", "description": "Design schema" },
         { "id": 2, "assigneeRole": "Senior Coder", "description": "Implement endpoints", "dependsOn": [1] },
         { "id": 3, "assigneeRole": "Security QA", "description": "Audit security & test", "dependsOn": [2] }
       ]
     }
     ```
  2. **Execution Phase:** Orchestrator executes tasks based on dependency graph, streaming each specialist's working progress.
  3. **Review & Synthesis Phase:** Designated Reviewer critiques output; Leader packages final response for user.

### 4.4. Grok "Fun Mode" Engine
When `funMode` is toggled:
- The system injects a distinctive persona guideline:
  > *"Tone: Channel Grok — witty, uninhibited, intellectually razor-sharp, with a touch of playful sarcasm. Cut through corporate buzzwords and speak candidly."*

---

## 5. UI/UX Design (Grok Aesthetic)

1. **Cyberpunk Dark Theme:**
   - Deep obsidian background (`#0B0E14`), surface card (`#161B26`), borders (`#232B3E`), accent cyan (`#00F0FF`), Grok orange (`#FF7A00`), neon purple (`#A855F7`).
2. **Collapsible `<ReasoningBlock />`:**
   - Displays real-time streaming thought process.
   - Shows elapsed thinking time: *"Thinking for 4.2s"*.
   - Collapses neatly once the answer begins streaming, expandable on click.
3. **Active Speaker Bar:**
   - Glowing pill indicator at bottom: *"⚡ Grok 3 is evaluating architecture trade-offs..."*
4. **Member Manager & 1-Click Company Templates:**
   - Pre-bundled templates for immediate testing:
     - **"AI Startup Founders":** CEO (GPT-4o), CTO (Grok 3), Chief Architect (Claude 3.7 Sonnet), Security Hacker (DeepSeek R1).
     - **"Philosophical Roundtable":** Rationalist, Empiricist, Skeptic, Synthesizer.
     - **"Full-Stack Dev Crew":** Planner, Frontend, Backend, QA Engineer.

---

## 6. Testing & Quality Assurance Plan

1. **Unit Tests:**
   - Provider Gateway parsing (OpenAI stream chunks, Anthropic SSE, DeepSeek reasoning tags `<think>...</think>`).
   - SQLite migration idempotence.
   - Company & member CRUD operations.
2. **Integration Tests:**
   - Multi-agent turn dispatcher in Roundtable mode.
   - Pipeline task decomposition json parsing & fallback.
   - Fun Mode prompt injection verification.
3. **End-to-End Smoke Tests:**
   - Electron app launch, create company, start roundtable debate, observe streaming deltas and reasoning blocks.
