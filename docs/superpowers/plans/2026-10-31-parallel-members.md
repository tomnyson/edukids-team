# Parallel Meeting Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the members of one company turn reply at the same time (debate round, pipeline execution, several @mentions) instead of one after another, behind a per-company switch.

**Architecture:** A pure `runBatch` helper runs a list of member turns with a concurrency cap, stops starting new ones after a failure or a stop, and waits for the running ones before it rethrows. `runRoundtable` and `runPipeline` hand their middle phase and their @mention replies to it; framing/planning before and synthesis/delivery after stay serial barriers. The renderer keeps one pending bubble per member instead of one for the whole meeting.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, `better-sqlite3`, node `.cjs` tests on Node 26 type stripping, lucide-react.

**Spec:** None was written; the user asked for "allow acc bot co the chay multi thread" (let the bots run in parallel). The decisions below stand in for it and are the planner's calls, open to the user's review.

## Global Constraints

- Reading of the request: members inside one turn run concurrently. Different conversations already run at the same time, since `inFlightCompanyRuns` in `src/main/ipc/companies.ts` is keyed by conversation.
- Opt-in per company: `Company.parallelMembers: boolean`, column `companies.parallel_members INTEGER NOT NULL DEFAULT 0`, migration 7. Off means exactly today's behavior and order.
- Batches: the roundtable debate members, the pipeline members `members[1..]`, and the members of an @mention prompt. Framing, synthesis, planning and delivery never run alongside anything.
- Cap: `MAX_PARALLEL_MEMBERS = 3`. A batch with two or more members on provider `ollama` runs one at a time (one local server would swap models in and out).
- One executor, unchanged: the moderator in roundtable, `members[0]` in pipeline. Everyone else stays chat-only.
- Failure: after the first failure or a stop, start no new member; wait for the running ones, keep their saved replies, then throw the first failure in batch order. A stop never shows an error.
- `stepIndex` is reserved when a member starts, not when it finishes.
- UI copy in English. Main process logs only with `console.error('[tag] …')`; no `console.log`. Immutable updates.
- Tests: node `.cjs` files that `require` a `.ts` module directly; such a module may only use type-only imports. Add every new test file to the `test` script in `package.json`.
- Never open or write the real `~/Library/Application Support/Claude GUI/history.db`; Electron checks use a throwaway `userData`.
- No commits unless the user asks; each task ends at a green run instead.

## Review Focus

- One member fails mid-batch: the siblings' replies are saved and shown, then one error card appears, and synthesis/delivery does not run. Pinned in Task 1 (`runBatch` failure tests).
- Stop mid-batch: every running member stops, no error card, no event arrives after the stop settles. Pinned in Task 3 (Electron section 5c).
- Interleaved deltas: two members streaming at once each keep their own text, live and saved. Pinned in Task 4 (`appendToTurn` test) and Task 3 (saved reply equals that member's deltas).
- The executor among parallel @mentions (`@Bos @DEV`): Bos still writes in the project folder, DEV stays chat-only, both reply. Pinned in Task 3 (section 5b).
- A non-executor that can still write files: `opencode` spawns in the app's own working directory with its agent tools, so in parallel two members could write there at once. Fixed in Task 5.

---

### Task 1: `runBatch` helper

**Files:**
- Create: `src/main/orchestrator/member-batch.ts`
- Create: `test/member-batch.test.cjs`
- Modify: `package.json` (append `&& node test/member-batch.test.cjs` to `test`)

**Interfaces:**
- Produces:
  - `export const MAX_PARALLEL_MEMBERS = 3`
  - `export function batchLimit(members: readonly Pick<CompanyMember, 'provider'>[], parallel: boolean): number`. Returns 1 when `parallel` is false or two or more members have provider `'ollama'`, else `MAX_PARALLEL_MEMBERS`.
  - `export async function runBatch<T>(items: readonly T[], options: { readonly limit: number; readonly signal: AbortSignal }, run: (item: T) => Promise<void>): Promise<void>`. Starts items in order, at most `limit` at once (`limit` below 1 counts as 1). Starts none once `signal.aborted` or once any item has failed. Settles after every started item settles; rejects with the error of the lowest-index failed item, else resolves. With `limit` 1 this is exactly today's serial loop.

- [ ] **Step 1: Write the failing test** `test/member-batch.test.cjs`, using a deferred helper (`{ promise, resolve, reject }`) per item so the test decides when each finishes, and a `running`/`peak` counter inside `run`:
  - `limit 1 runs in order, one at a time`: 3 items; `peak === 1`; start order `[0, 1, 2]`.
  - `limit 2 never runs more than two`: 4 items; `peak === 2`; all 4 ran.
  - `limit 3 starts all three before any finishes`: after one microtask flush, started `[0, 1, 2]` while none resolved.
  - `limit 0 counts as 1`: `peak === 1`, all ran.
  - `a failure waits for the running siblings`: limit 3, item 1 rejects with `Error('b')` first, items 0 and 2 resolve after; `runBatch` rejects with message `'b'` only after 0 and 2 settled (record settle order).
  - `a failure starts nothing new`: limit 1, item 0 rejects; item 1 never started.
  - `the lowest index failure wins`: limit 3, item 2 rejects `'c'` first, item 0 rejects `'a'` later; rejects with `'a'`.
  - `a stop starts nothing new`: limit 1, abort the controller inside item 0's `run`; item 1 never started; resolves.
  - `an empty list resolves`.
  - `batchLimit`: `(members, false) === 1`; three `anthropic` members with `true` → `3`; `[ollama, anthropic]` → `3`; `[ollama, ollama, anthropic]` → `1`.

- [ ] **Step 2: Run** `node test/member-batch.test.cjs`. Expected: FAIL, `Cannot find module '../src/main/orchestrator/member-batch.ts'`.

- [ ] **Step 3: Implement** `src/main/orchestrator/member-batch.ts` per the Interfaces block. Type-only import of `CompanyMember` from `@shared/types`; no runtime imports. A worker-pool loop (`limit` workers pulling the next index) is the expected shape.

- [ ] **Step 4: Run** `node test/member-batch.test.cjs`, then `npm test`. Expected: both exit 0.

---

### Task 2: `parallelMembers` company flag

**Files:**
- Modify: `src/main/db/schema.ts` (append migration 7 to `MIGRATIONS`, with a one-line comment above it in the style of migration 6)
- Modify: `src/shared/types.ts` (`Company` ~line 199, `UpdateCompanyInput` ~line 250)
- Modify: `src/main/db/companies.ts` (`CompanyRow`, `toCompany`, `updateCompany`)
- Modify: `test/company-summaries.test.cjs:11,37` (`6` → `7`)
- Create: `test/company-parallel.test.cjs`; add it to `package.json` `test`

**Interfaces:**
- Produces: `Company.parallelMembers: boolean` (readonly); `UpdateCompanyInput.parallelMembers?: boolean`; `window.api.companies.update(id, { parallelMembers })` persists it (no IPC change; the patch passes through).

- [ ] **Step 1: Write the failing test** `test/company-parallel.test.cjs`: `migrate()` on `new Database(':memory:')` (same loading as `test/company-summaries.test.cjs`); assert `user_version === 7`; insert a company with only `name` and `default_mode`; assert its `parallel_members === 0`; update it to 1 and read back 1; running `migrate()` again leaves `user_version` at 7.

- [ ] **Step 2: Run** `node test/company-parallel.test.cjs`. Expected: FAIL on `user_version` (6 !== 7).

- [ ] **Step 3: Implement.** Migration 7: `ALTER TABLE companies ADD COLUMN parallel_members INTEGER NOT NULL DEFAULT 0;`. `CompanyRow.parallel_members: number`; `toCompany` maps `parallelMembers: Boolean(row.parallel_members)`; `updateCompany` handles `patch.parallelMembers` like `funMode` (`parallel_members = ?`, `1`/`0`). Bump the two asserts in `test/company-summaries.test.cjs`.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: exit 0.

---

### Task 3: Runners use `runBatch`

**Files:**
- Modify: `src/main/orchestrator/roundtable.ts`
- Modify: `src/main/orchestrator/pipeline.ts`
- Test: `/private/tmp/claude-501/-Applications-work-claude-app/c0fb04bf-b205-45fa-9c6d-f1bb8580c87a/scratchpad/mention-route.cjs` (Electron route script; real haiku calls through `out/main/index.js` with a throwaway `userData`)

**Interfaces:**
- Consumes: `runBatch`, `batchLimit` (Task 1); `company.parallelMembers` (Task 2).
- Produces: event stream where batch members' `started` events all precede the first `member-done` of the batch. No change to `CompanyStreamEvent`.

- [ ] **Step 1: Write the failing check.** In `mention-route.cjs`, add `text: e.text` to the `eventsOf` mapping, then add section 5 after section 3b (before the stop section 4). It sets `companies.update(ids.company, { parallelMembers: true })` and ends by setting it back to `false`:
  - 5a, no mention, `'Each of you reply with the single word OK'`:
    - `parallel: DEV and tester both start before either is done`: `max(started DEV, started tester) < min(member-done DEV, member-done tester)`, using event `at`.
    - `parallel: synthesis starts after both debate replies`: the last `started` for Bos is after both `member-done`.
    - `parallel: each saved reply is only its own text`: the DEV and tester saved `content` equal the joined `delta` texts with that `memberId`.
    - `parallel: prompt once, four replies, no error`: as in section 3.
  - 5b, `'@Bos and @DEV, each reply with the single word OK'`: `both mentioned start before either is done`; the run finishes without error.
  - 5c, stop mid-batch, `'Each of you write a 300 word essay about rivers'`:
    1. Wait until both DEV and tester have a `delta`.
    2. Call `stopStream`.
    3. `sleep(20000)`.
    4. Check `parallel stop sends no error` and `no event after the stop settles` (same rule as section 4: nothing later than stop + 2500 ms).
  - 5d, pipeline (`defaultMode: 'pipeline'`): `pipeline parallel: DEV and tester overlap` (same overlap rule), and starts begin and end with Bos. Reset to `'roundtable'`.

- [ ] **Step 2: Run** `npm run build && electron /private/tmp/claude-501/-Applications-work-claude-app/c0fb04bf-b205-45fa-9c6d-f1bb8580c87a/scratchpad/mention-route.cjs` (no `timeout` on macOS). Expected: sections 1–4 PASS, the section 5 overlap checks FAIL (members still run in turn).

- [ ] **Step 3: Implement in `roundtable.ts`.**
  - In `executeTurn`, take `const stepIndex = currentStep++` right after the `signal.aborted` guard, and use it in `insertCompanyMessage`.
  - The @mention branch becomes `await runBatch(addressed, { limit: batchLimit(addressed, company.parallelMembers), signal }, (m) => executeTurn(m, 'reply', DIRECT_REPLY_INSTRUCTION))`.
  - The debate loop becomes one `runBatch` over the debaters. The debaters are `members` without the moderator when `members.length > 1`, the same filter as today.
  - The debate instruction is today's text when `limit === 1`. Otherwise it is this text:
    `Present your specialized analysis and critique of the topic and of the moderator's framing. The other members answer at the same time as you, so you cannot see their points yet. Highlight specific technical decisions, challenges, or alternative paradigms.`
  - Framing and synthesis are unchanged.

- [ ] **Step 4: Implement in `pipeline.ts`.**
  - Reserve `stepIndex` the same way.
  - The @mention branch uses `runBatch` as in roundtable.
  - The execution loop becomes `runBatch(members.slice(1), { limit: batchLimit(members.slice(1), company.parallelMembers), signal }, (m) => executeStep(m, 'execution', <today's instruction>).then(() => undefined))`.
  - Planning and delivery are unchanged.

- [ ] **Step 5: Run** `npm run build`, then the route script again. Expected: every check PASS, sections 1–4 included. Then run `electron …/scratchpad/notes-route.cjs`. Expected: `14/14 passed`.

---

### Task 4: One pending bubble per member

**Files:**
- Create: `src/renderer/src/hooks/pending-turns.ts`
- Create: `test/pending-turns.test.cjs`; add it to `package.json` `test`
- Modify: `src/renderer/src/hooks/useCompanyChatStream.ts`
- Modify: `src/renderer/src/components/chat/ActiveSpeakerBar.tsx`
- Modify: `src/renderer/src/components/chat/ChatPane.tsx:183-185,208-212`
- Modify: `src/renderer/src/components/chat/CompanyTurn.tsx` (import path of `PendingCompanyTurn` only)

**Interfaces:**
- Produces, in `pending-turns.ts`, which has no runtime imports:
  - `export interface PendingCompanyTurn`: today's fields plus `readonly memberId: number | null`. Moved here; `useCompanyChatStream.ts` re-exports the type.
  - `export function startTurn(turns: readonly PendingCompanyTurn[], turn: PendingCompanyTurn): readonly PendingCompanyTurn[]`. Replaces the entry with the same `memberId`, or appends.
  - `export function appendToTurn(turns: readonly PendingCompanyTurn[], memberId: number | null, field: 'content' | 'reasoning', text: string): readonly PendingCompanyTurn[]`. Only the matching entry changes. If no entry matches, it returns `turns` itself.
  - `export function endTurn(turns: readonly PendingCompanyTurn[], memberId: number | null): readonly PendingCompanyTurn[]`.
- Hook return: `pendingTurns: readonly PendingCompanyTurn[]` and `activeSpeakers: readonly string[]` (the `memberName` of each pending turn). These replace `pending` and `activeSpeaker`.
- `ActiveSpeakerBar` props: `activeSpeakers: readonly string[]` replaces `activeSpeaker`.

- [ ] **Step 1: Write the failing test** `test/pending-turns.test.cjs`, requiring `../src/renderer/src/hooks/pending-turns.ts`:
  - `interleaved deltas stay apart`:
    1. Start A (id 2) and B (id 3).
    2. Append content `a1`, then `b1` to B, then `a2` to A.
    3. Assert A's content is `'a1a2'` and B's content is `'b1'`.
  - `reasoning goes to its own member`: same shape, with field `'reasoning'`.
  - `ending one keeps the other`: `endTurn(…, 2)` leaves only B, with content unchanged.
  - `starting the same member again replaces it`: length stays 1, content resets to `''`.
  - `an unknown member changes nothing`: `appendToTurn(turns, 99, 'content', 'x') === turns`.
  - `inputs are never mutated`: deep-equal a frozen copy of the input after each call.

- [ ] **Step 2: Run** `node test/pending-turns.test.cjs`. Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `pending-turns.ts`** per the Interfaces block.

- [ ] **Step 4: Rewire the renderer.**
  - In `useCompanyChatStream`, map the events to the reducers:
    - `started` → `startTurn`, with `memberId: event.memberId`.
    - `delta` and `reasoning` → `appendToTurn` with `event.memberId`.
    - `member-done` → `endTurn`.
    - `finished` and `stop` → `[]`.
    - `error` keeps today's behavior: the pending turns stay.
  - `activeSpeakers` is derived from the pending turns; it is not separate state.
  - `ChatPane` renders `companyStream.pendingTurns.map((p) => <PendingCompanyTurnView key={p.memberId ?? p.memberName} pending={p} />)` and passes `activeSpeakers`.
  - `ActiveSpeakerBar` renders nothing when `activeSpeakers` is empty and `phaseDescription` is empty. It shows one `BotAvatar` per speaker, at most 3, overlapping with `-space-x-1.5`. With no speakers it uses seed `'meeting'`.
  - Label by number of speakers:
    - 0: `phaseDescription`.
    - 1: today's text, the name in `font-semibold text-ink` followed by `phaseDescription ?? 'is thinking…'`.
    - 2 or more: the names joined with `', '` in `font-semibold text-ink`, followed by ` are speaking at once…`. The per-member `phase` text is ignored.

- [ ] **Step 5: Run** `node test/pending-turns.test.cjs && npm test && npm run typecheck && npx eslint src/renderer/src/hooks src/renderer/src/components/chat`. Expected: exit 0, 0 errors.

---

### Task 5: Parallel switch in the composer

**Files:**
- Modify: `src/renderer/src/components/chat/Composer.tsx`. Add a `ParallelToggle` next to `FunModeToggle` (~line 265), plus the prop `onToggleParallel?: () => void`.
- Modify: `src/renderer/src/components/chat/ChatPane.tsx`. Add the prop `onToggleParallel` and pass it through, the same way as `onToggleFunMode`.
- Modify: `src/renderer/src/App.tsx`. Add `handleToggleParallel`, a copy of `handleToggleFunMode` (~line 60) with `{ parallelMembers: !activeCompany.parallelMembers }`.

**Interfaces:**
- Consumes: `Company.parallelMembers` and `UpdateCompanyInput.parallelMembers` (Task 2).

- [ ] **Step 1: Implement `ParallelToggle({ on, onToggle })`.**
  - Same markup and class structure as `FunModeToggle`.
  - Icon `Layers` from lucide-react, with `aria-hidden`.
  - Label `Parallel`, title `Members reply at the same time`, and `aria-pressed={on}`.
  - On-state classes use the `ok` token (`border-ok/50 bg-ok/12 text-ok`) so it does not read as fun mode's `warn`.
  - Render it only when `company` is set and has more than one member.

- [ ] **Step 2: Run** `npm run typecheck && npx eslint src/renderer/src && npm run build`. Expected: exit 0.

- [ ] **Step 3: Check it in the running app.**
  1. Restart `npm run dev`.
  2. Click `Parallel` and confirm the pill turns green.
  3. Reload the window and confirm it is still on.
  4. Ask the company a question with no mention.
  5. Confirm two bubbles stream at the same time and the bar reads `DEV (Developer), tester (QA) are speaking at once…`.
  6. Click `Parallel` again to turn it off.

---

### Task 6: opencode runs in an empty folder

**Files:**
- Modify: `src/main/providers/opencode-adapter.ts`. Give `spawn` (~line 37) `cwd: workspace`, where `workspace = join(app.getPath('userData'), 'opencode-workspace')`, created with `mkdir(…, { recursive: true })` before the spawn. Use the same lines as `runAgy` in `src/main/providers/agy-adapter.ts:28-29`, and add a one-line comment in the style of the codex and agy adapters.

- [ ] **Step 1: Check the gap.** Run `grep -n "cwd" src/main/providers/opencode-adapter.ts`. Expected: no match, which means the spawn inherits the app's working directory.

- [ ] **Step 2: Implement** as described in Files.

- [ ] **Step 3: Run** `npm run typecheck && npx eslint src/main/providers/opencode-adapter.ts && npm test`. Expected: exit 0.
  - If `opencode` is on PATH: run one opencode member turn in a throwaway Electron. Then run `git status --porcelain` and expect no new files in the repo.
  - If it is not on PATH: say so in the hand-off. Do not claim this was checked.

---

### Task 7: Whole-branch check

- [ ] **Step 1: Run** `npm test && npm run typecheck && npx eslint src && npm run build`. Expected: exit 0, and every `test/*.test.cjs` in the script passes.
- [ ] **Step 2: Run** both Electron scripts:
  - `…/scratchpad/mention-route.cjs`: all checks pass, sections 1–5.
  - `…/scratchpad/notes-route.cjs`: `14/14 passed`.
- [ ] **Step 3: Report** to the user:
  - Turning `Parallel` on changes debate content, because debaters no longer see each other's points in the same round.
  - The cap is 3 at once.
  - `npm run dev` needs a restart.
  - Nothing is committed.
