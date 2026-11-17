# Design: Web search and DeepSearch (Phase 2)

- **Date:** 2026-11-16 (revised the same day)
- **Status:** Implemented in the working tree on 2026-11-16, uncommitted. See section 10 for where the code differs from this design.
- **Depends on:** Phase 0 + 1 (sealed provider keys, `openai-stream.ts`, direct chat) being reviewed and committed.

## 1. Goal

Emulate how the Grok bot behaves, with whatever model the user has configured. A direct chat can
answer from the live web and shows where each claim came from. "DeepSearch" is the same thing run
for several rounds and written up as a report.

**Decision (user, 2026-11-16):** no dependency on the xAI API. The behaviour is reproduced in the
app, so it works the same with Claude, GPT, Gemini, DeepSeek, a local Ollama model or a CLI.

Out of scope: X/Twitter search (it exists only behind xAI's API), search inside roundtable and
pipeline meetings, image search.

## 2. Approach: search, then answer

The app does the searching; the model only reads and writes. No provider tool-calling is used,
because its format differs per provider and the CLI adapters and many local models have none.

```
user prompt
   │
   ▼
1. Query step    the model turns the prompt and recent turns into 1-3 search queries,
                 or answers "none" when no search is needed
   │
   ▼
2. Search        the app sends each query to the configured search backend
   │
   ▼
3. Read          the app loads the top pages in its hidden browser and takes their text
   │
   ▼
4. Answer        the model gets the numbered sources as context and replies,
                 citing them as [1], [2]
```

Steps 1 and 4 go through the existing `dispatchLLM`, so every provider works unchanged.

DeepSearch repeats steps 1 to 3: after each round the model is shown what it has and asked what
is still missing, up to a fixed number of rounds, then writes a structured report.

## 3. Components

All new code lives in `src/main/search/`. Pure modules take their inputs as arguments and are
tested without the network.

| File | Role |
|---|---|
| `search/queries.ts` | Pure. The query-step prompt, and parsing the model's reply into queries. |
| `search/backend.ts` | The `SearchBackend` interface: `search(query, signal) → SearchHit[]`. |
| `search/backends/searxng.ts` | Default backend: a SearXNG instance's JSON API (section 5). |
| `search/backends/browser-serp.ts` | Opt-in backend: loads a results page in the hidden browser. |
| `search/backends/serp-parse.ts` | Pure. Turns the links read from a results page into `SearchHit[]`. |
| `search/url-guard.ts` | Pure. Decides whether a URL may be requested (section 6). |
| `search/request-policy.ts` | Pure. Allow or cancel one browser request from its URL and resource type. |
| `search/browser.ts` | The hidden browser: one locked-down window, `load(url, signal) → PageSnapshot`. |
| `search/extract.ts` | Pure. Page text cleaned up and clipped to a budget. |
| `search/context.ts` | Pure. Numbered sources block for the prompt; maps `[N]` back to URLs. |
| `orchestrator/searched.ts` | Runs the four steps for a direct chat and emits stream events. |

`browser.ts` is the only module that touches Electron. Everything it decides is delegated to the
pure modules, so the rules are tested without a window.

```ts
export interface SearchHit {
  readonly title: string
  readonly url: string
  readonly snippet: string
}

export interface Citation {
  readonly index: number
  readonly title: string
  readonly url: string
}
```

`LLMRequest` does not change. The sources are text in the messages.

## 4. App changes

- **Stream events.** `CompanyStreamEvent` gains
  `{ type: 'search'; conversationId; status: 'querying' | 'searching' | 'reading'; detail: string }`.
  `ActiveSpeakerBar` shows it ("Searching: …", "Reading 4 pages…").
- **Citations.** One append-only migration: `ALTER TABLE company_messages ADD COLUMN citations TEXT`
  (JSON array, null when none). Read through a validator; a malformed value is an empty list.
  `CompanyTurn` turns `[N]` in the reply into links and lists the sources under it.
- **Toggle.** A Search control in the composer for direct chats: Off, Search, DeepSearch.
  Remembered per conversation in `conversations.search_mode`. It travels with the prompt through
  `askStream` and `CompanyJob`, and is validated in `submitCompanyPrompt`.
- **Settings.** A Search pane: the SearXNG instance URL with a Test button, and the opt-in switch
  for `browser-serp`. No key is needed by either backend.
- **Persona.** Fun mode already supplies the Grok tone. No change.

## 5. Search backend and the hidden browser

**Decision (user, 2026-11-16):** free search or a headless browser. No paid API, no key.

### 5.1 The hidden browser

Electron already ships Chromium, so the headless browser is a `BrowserWindow` created with
`show: false`. No Playwright or Puppeteer, and nothing extra to download or package.

One window, reused, in its own in-memory session (`partition` without the `persist:` prefix), so
it shares no cookies or storage with the app and keeps none after quit. It is used for two jobs:
loading a results page, and reading the pages the answer is built from. A real browser also reads
pages that only render with JavaScript, which a plain HTTP fetch cannot.

`load(url, signal)` navigates, waits for the page to settle or a timeout, then reads the title,
the visible text and the links with `webContents.executeJavaScript`. What comes back is untrusted:
it is checked to be the expected shape and clipped before anything else sees it.

Pages are loaded one at a time. A turn is slower than with an HTTP fetch; section 9 accepts that.

### 5.2 Backends

**Decision (user, 2026-11-16):** SearXNG is the default. `browser-serp` is opt-in.

| Backend | Setup | Notes |
|---|---|---|
| `searxng` (default) | Instance URL | Calls the instance's JSON API. The instance must have JSON output enabled; many public ones do not. |
| `browser-serp` (opt-in) | None | Loads a search engine's results page in the hidden browser and reads the result links. |

`searxng` has no markup to break, no challenge pages, and puts no automated load on a search
engine's site. Its cost is setup: the user runs an instance or points at one.

- Until an instance URL is saved, the composer's Search control is disabled and links to the
  Search pane. Nothing falls back to `browser-serp` on its own.
- The instance URL is the user's own setting, and a self-hosted instance is usually on loopback
  or the local network. The adapter calls it from the main process, so the SSRF guard of section 6
  does not apply to this one URL. It still must be `http:` or `https:`, and the reply is validated
  as untrusted JSON. The guard applies in full to every page read afterwards.
- The Search pane has a "Test" button that runs one query and shows the error when JSON output is
  off.
- The SearXNG API is looked up in its docs before coding.

`browser-serp` is for users without an instance. It is off until chosen in the Search pane, which
states its limits next to the choice:

- The results page's markup is not an API. When it changes, `serp-parse.ts` returns nothing and the
  turn reports "search returned no results" instead of answering from nothing.
- Engines rate-limit and challenge automated use, and their terms may not allow it. The app keeps
  to one query at a time, the per-turn caps of section 6, and a short cache of recent queries. When
  a challenge page comes back the turn stops with a clear message; the app does not try to get
  around it.
- Which engine, and its results URL and selectors, is one small config object in `browser-serp.ts`,
  chosen and checked against the live page at step 3 of section 8.

## 6. Security

Loading arbitrary pages in a browser inside the app is the main risk in this design. The hidden
window runs hostile JavaScript by design, so it gets nothing the app has.

- **Window lockdown.** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, no
  preload, its own in-memory session. The main window's `sandbox: false` is not copied.
  `setWindowOpenHandler` returns `{ action: 'deny' }`. The session's `will-download` handler
  cancels every download. `setPermissionRequestHandler` and `setPermissionCheckHandler` refuse
  everything. No IPC handler accepts messages from this window.
- **SSRF.** `session.webRequest.onBeforeRequest` on that session sees every request the page
  makes, subresources included, and cancels what `request-policy.ts` refuses: any scheme but
  `http:` and `https:`, and loopback, private, link-local and metadata addresses in any spelling
  `url-guard.ts` knows. Navigations are checked the same way.
- **Known gap: DNS rebinding.** `onBeforeRequest` gives the URL, not the address it resolves to,
  so a public hostname that resolves to a private address passes the hostname check. Before
  coding, check whether Electron 39 lets the main process resolve a host in that session, or
  exposes the remote address of a response; neither was confirmed in the docs lookup for this
  document. If neither exists, the gap is documented in the Search pane rather than hidden.
- **Less to load.** Images, media and fonts are cancelled: they are not needed for text and are
  most of a page's requests.
- **Limits.** Per page: a load timeout and a cap on the text taken. Per turn: a cap on queries
  and on pages. The window is destroyed and rebuilt if a page hangs it.
- **Prompt injection.** Page text is untrusted. It is wrapped and labelled as source material,
  and the answer step is told to treat it as data. A direct chat runs with `executor: true`,
  which gives CLI-backed models tools in the project folder; a searched turn runs with
  `executor: false`, so a poisoned page cannot make the model run commands.
- **Rendered links.** Only `http:` and `https:` citations become links, opened in the system
  browser, never in the app window.
- **Privacy.** Queries go to the search engine or the SearXNG instance, and pages are requested
  from the user's IP. The Search pane says so.

Electron APIs above were checked against the v39.5.0 docs through Context7 (`/electron/electron`)
on 2026-11-16: `show: false`, `partition`, `sandbox`, `webRequest.onBeforeRequest`,
`setPermissionRequestHandler`, `will-download`, `setWindowOpenHandler`. Not checked: whether
`onBeforeRequest` fires again for each redirect hop. Step 3 of section 8 proves it with a test.

## 7. Testing

Tests first, in the existing `test/*.test.cjs` style.

| Test | Covers |
|---|---|
| `search-queries.test.cjs` | Parsing the model's reply: lists, "none", junk, over-long output. |
| `url-guard.test.cjs` | Schemes, private and loopback ranges in IPv4 and IPv6, encoded forms, redirects. |
| `request-policy.test.cjs` | Allow and cancel by scheme, address and resource type. |
| `serp-parse.test.cjs` | A saved results page's links to hits; ads and engine-internal links dropped; empty and challenge pages. |
| `extract.test.cjs` | Whitespace collapsed, clipping, non-string input refused. |
| `search-context.test.cjs` | Numbering, budget, `[N]` to URL mapping, out-of-range numbers. |
| `citations.test.cjs` | JSON round trip, malformed column, scheme filter. |
| `searxng.test.cjs` | The adapter against a local fake server: good JSON, bad JSON, HTTP errors. |

`browser.ts` needs Electron and cannot run under the plain `node` test runner. It is covered by a
script that starts Electron against a local fixture server: a page that redirects to a private
address, one that requests a private subresource, one that opens a window, one that starts a
download, one that never finishes loading. The fixture server is on loopback, which the guard
refuses, so the guard takes an explicit test-only allowance for that one origin.

## 8. Steps

1. `url-guard.ts`, `request-policy.ts`, `extract.ts`, `queries.ts`, `context.ts` with tests.
2. `browser.ts` with the Electron fixture script; settle the DNS rebinding question (section 6).
3. `searxng.ts` against a local fake server. Then `browser-serp.ts` and `serp-parse.ts`: pick the
   engine, save a results page as the test fixture.
4. `orchestrator/searched.ts`; search mode on the queue job and the IPC boundary.
5. Migration, citations storage, `search` stream event.
6. Composer control, Search settings pane, source list in `CompanyTurn`.
7. DeepSearch rounds and report prompt.

## 9. Trade-offs accepted

- Two model calls per searched turn instead of one, so it is slower and costs more tokens.
- No X/Twitter results.
- Search needs setup before first use: a SearXNG instance. The no-setup alternative,
  `browser-serp`, reads a results page that is not an API: it can break when the engine changes
  its markup, and can be rate-limited or challenged.
- Pages load in a real browser one at a time, so reading sources takes seconds, not milliseconds.
- Answer quality depends on the configured model following the citation format; a weak local
  model may cite loosely.

## 10. As built

Where the code differs from the sections above:

- **No `search` stream event.** Search progress is sent as the existing `phase` event with
  `phase: 'search'`, which `ActiveSpeakerBar` already shows. No renderer change was needed.
- **Search mode is not a database column.** It is remembered per conversation in the renderer's
  `localStorage` (`hooks/useSearchMode.ts`) and travels with each prompt. No
  `conversations.search_mode` migration.
- **DNS rebinding (section 6) is narrowed, not left open.** Electron 39 has
  `ses.resolveHost`, so `browser.ts` resolves every request's hostname in the reader's session
  and cancels the request unless every address is public. What remains is the gap between that
  lookup and Chromium's own, which share the session's host cache.
- **Redirects.** The fixture test shows `onBeforeRequest` does fire for a redirect's target: a
  public page redirecting to a local address is cancelled.
- **The extraction script runs in an isolated world**
  (`executeJavaScriptInIsolatedWorld`), so a page that rewrites built-ins cannot forge the result.
- **`browser-serp` uses no selectors.** `serp-parse.ts` takes every link that leaves the engine
  for a public page, unwrapping the engine's redirect parameter. Result snippets are not read.
- **Files not in section 3:** `search/limits.ts`, `search/gather.ts`, `search/cache.ts`,
  `search/engine.ts`, `orchestrator/reply.ts`, `shared/search.ts`, `shared/citations.ts`,
  `ipc/search.ts`.
- **Tests.** `npm test` covers the pure modules and the SearXNG adapter. `npm run test:browser`
  runs the hidden browser inside Electron against two local servers. `orchestrator/searched.ts`
  has no automated test: it needs the database and a model.

## Appendix: the xAI route, not taken

Looked up through Context7 (`/websites/x_ai_developers`) on 2026-11-16. xAI's own search is a
server-side tool on `POST /v1/responses` (`tools: [{ "type": "web_search" }, { "type": "x_search" }]`);
its Chat Completions endpoint, which `openai-adapter.ts` uses, is deprecated and cannot search.
Responses are stored by xAI for 30 days. Rejected: it ties the feature to one provider and to that
storage. xAI models still work in this design as an ordinary chat model.
