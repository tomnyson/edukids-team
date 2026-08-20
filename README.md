# Claude GUI

A macOS desktop app that wraps the `claude` CLI in a chat interface, with every
turn stored locally in SQLite.

Electron (main + preload + renderer) · React 19 · TypeScript · Tailwind v4 ·
better-sqlite3.

## What it does

- **Streaming chat.** Runs `claude --print --output-format stream-json
--include-partial-messages`, so answers render token by token as Markdown
  (GFM tables, code blocks, lists). Stop cancels the run mid-flight.
- **Real sessions.** Each conversation owns a UUID passed as `--session-id` on
  the first turn and `--resume` after that, so the CLI keeps context across
  turns and across app restarts.
- **Attachments.** Drag files in or use the paperclip. Paths are resolved in the
  preload via `webUtils.getPathForFile`, mentioned in the prompt as `@/abs/path`,
  and their directories are granted with `--add-dir`.
- **Model picker.** opus / sonnet / haiku / fable, remembered per conversation.
  Leaving it on `default` omits `--model` entirely.
- **Projects.** A project is a folder you pick through the native dialog. Chats
  started in it run there and inherit its default model and effort. Removing a
  project never deletes a chat — they move to "Unfiled".
- **History rail.** Conversations are grouped under their project, each group
  collapsible; filter by title, delete, or hide the rail entirely. Titles derive
  from the first prompt. Duration and cost are shown per turn.
- **macOS PATH handling.** GUI apps don't inherit the shell `$PATH`, so the
  binary is resolved from the login shell's environment plus the usual install
  locations (`~/.local/bin`, Homebrew, npm global).

## Data

`app.getPath('userData')/history.db` — `projects`, `conversations` and
`chat_history` tables, created and migrated on launch.
`app.getPath('userData')/settings.json` — global preferences; the voice API key
is stored there encrypted by Electron's `safeStorage` and never leaves main.

## Security posture

`contextIsolation` on, `nodeIntegration` off. The renderer only sees the vetted
methods in `src/preload/index.ts`; no `ipcRenderer`, no arbitrary channels. The
CLI is spawned with `shell: false` and the prompt travels as an argv entry after
`--`, so nothing user-typed is ever parsed by a shell. Model ids and attachment
paths are validated at the IPC boundary before they can reach argv.

## Requirements

- macOS, Node 20+
- The `claude` CLI installed and authenticated (`claude --version` should work
  in your terminal)

## Commands

```bash
npm install
npm run dev           # electron-vite dev server
npm run typecheck     # node + web projects
npm run lint
npm run smoke         # boots the real main bundle, drives the IPC surface, hits the real CLI
npm run test:ui       # drives the real React UI through the DOM, screenshots each state
npm run icons         # regenerates build/icon.icns, .ico, .png from the mark
npm run build:mac     # packaged .app / dmg
```

`smoke` and `test:ui` both call the live CLI, so they cost tokens and take a
minute. Screenshots go to `$SMOKE_OUT` (defaults to a temp dir).

## Layout

```
src/
├── main/
│   ├── claude/      # binary resolution, argv construction, NDJSON stream parsing
│   ├── db/          # connection, schema, queries
│   ├── ipc/         # channel handlers + input validation
│   └── index.ts
├── preload/         # contextBridge surface
├── renderer/src/
│   ├── components/  # chat/, sidebar/, ui/
│   ├── hooks/       # useChatStream, useConversations, useAttachments
│   └── styles/      # tokens.css, global.css
└── shared/          # types + IPC channel names, used by both sides
```
