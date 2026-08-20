# Effort selector

Date: 2026-08-20
Status: approved, not yet implemented

Written in English to match the rest of the repo (README, code comments).

## Context

The Claude CLI accepts `--effort <level>`, verified against the installed
binary: valid values are `low`, `medium`, `high`, `xhigh`, `max`. The app
currently exposes only `--model`, through a native `<select>` in the composer.

This is sub-project ① of four requested together. The other three — syntax
highlighting with clickable file paths (②), a run-this-code button (③), and
voice input (④) — each get their own spec. Nothing in this document depends on
them.

## Goals

- Let the user pick an effort level for the next turn, alongside the model.
- Remember the choice per conversation, the way `lastModel` already is.
- Record which effort actually ran on each turn, so the transcript is truthful.
- Replace the two controls with one combined menu, matching the reference the
  user supplied: a pill reading `Sonnet High ⌄` that opens a popover listing
  models, with `Effort  High ›` opening a submenu.

## Non-goals

- Voice controls (the mic and waveform in the reference) — sub-project ④.
- A "More models" submenu. The app has four models; a flat list is enough, and
  a submenu would only add a click. Dropped deliberately, with the user's
  agreement.
- Exposing full model names (`claude-fable-5`). Aliases stay.

## Decision: hand-built popover, not a native menu

Electron could show a real macOS menu via `Menu.popup()` with `submenu`, which
brings keyboard handling, VoiceOver, and submenu arrows for free. It was
rejected for one reason: a native menu item cannot render the secondary
description line the reference shows under each model, and cannot follow the
app's dark palette.

So the menu is a React popover, and the keyboard and ARIA work that the native
menu would have given us becomes our responsibility — see *Keyboard and ARIA*.

## Data model

Migration 3, appended to `MIGRATIONS` in `src/main/db/schema.ts`. The two
shipped migrations are not touched.

```sql
ALTER TABLE chat_history  ADD COLUMN effort TEXT;
ALTER TABLE conversations ADD COLUMN last_effort TEXT;
```

`NULL` means "no `--effort` flag was passed", which is distinct from any
explicit level. Existing rows keep `NULL`, which is accurate: they ran without
the flag.

## Types

In `src/shared/types.ts`, mirroring the existing `MODELS` / `ModelId` /
`isModelId` trio:

```ts
export const EFFORTS = [
  { id: 'low',    label: 'Low',    hint: 'Fastest, least thorough' },
  { id: 'medium', label: 'Medium', hint: 'Balanced speed and depth' },
  { id: 'high',   label: 'High',   hint: 'More reasoning, slower' },
  { id: 'xhigh',  label: 'Extra high', hint: 'Deep reasoning on hard problems' },
  { id: 'max',    label: 'Max',    hint: 'Maximum reasoning, slowest' }
] as const

export type EffortId = (typeof EFFORTS)[number]['id']

export const isEffortId = (value: unknown): value is EffortId =>
  EFFORTS.some((effort) => effort.id === value)
```

Field additions, all optional/nullable so nothing existing breaks:

- `AskRequest.effort?: EffortId | null`
- `Message.effort: EffortId | null`
- `Conversation.lastEffort: EffortId | null`

`MODELS` gains an optional `hint`. Opus is `Deepest reasoning`, Sonnet is
`Balanced for everyday work`, Haiku is `Fastest and lightest`. Fable gets no
hint: the CLI's help text carries no description for it, and inventing one
would put a claim in the UI that nothing backs. The row renders label-only when
`hint` is absent.

## IPC

No new channels. `claude:ask` validates effort exactly as it validates model:

```ts
const effort = request?.effort ?? null
if (effort !== null && !isEffortId(effort)) {
  return fail({ code: 'INVALID_INPUT', message: `Unknown effort: ${String(effort)}` })
}
```

This check carries more weight than the model one. Probing the CLI with
`--effort bogus` produced:

```
Warning: Unknown --effort value 'bogus' — ignoring it and using the default
effort. Valid values: low, medium, high, xhigh, max.
```

It warns on stdout and continues. A bad value would therefore not fail the run —
it would silently run at the default effort while the app recorded and displayed
something else. The IPC boundary is the only place that can catch it.

## Runner

`RunOptions` gains `effort: EffortId | null`. In `buildArgs()`, next to the
model flag and before the session flags:

```ts
if (options.effort) args.push('--effort', options.effort)
```

`null` omits the flag, leaving whatever the CLI is configured with — the same
contract `--model` already has.

## Queries

`InsertHistoryInput` gains `effort`. `insertHistory` writes it into the new
`chat_history.effort` column and, in the same transaction, sets
`conversations.last_effort` the way it already sets `last_model`. `toMessage`
and `toConversation` map the new columns.

## UI

`ModelPicker.tsx` becomes `RunSettings.tsx` — it no longer picks only a model.
A new `components/ui/Popover.tsx` owns positioning, outside-click, Escape, and
focus return, so `RunSettings` holds only menu content.

Closed state: a pill in the composer's bottom row reading `Sonnet High ⌄`.
With neither chosen it reads `default`; with only one chosen it shows only that
one.

Open state, top to bottom:

- `default` — "Whatever the CLI is configured with"
- Opus, Sonnet, Haiku, Fable — label, optional hint, `✓` on the active one
- a divider
- `Effort` with the current level right-aligned and a `›`, opening a submenu of
  `default` plus the five levels, each with its hint and a `✓` on the active one

Selecting a model closes the whole popover. Selecting an effort closes the
submenu and the popover together — one choice, one dismissal.

State lives in `ChatPane.tsx` beside `model`, seeded from `conversation.lastEffort`
when a conversation is opened, and passed to `Composer` which passes it to
`RunSettings`.

`Turn.tsx` appends the effort to the meta row after the model, so history reads
`2m ago · sonnet · high · 4.2s · $0.03`. Turns that ran without the flag show
nothing extra.

## Keyboard and ARIA

The popover is `role="menu"`; rows are `role="menuitemradio"` with
`aria-checked`. The pill is `aria-haspopup="menu"` with `aria-expanded`.

- `↑` / `↓` move between rows, wrapping at the ends
- `→` or `Enter` on the Effort row opens the submenu and focuses its first row
- `←` returns from the submenu to the parent row
- `Escape` closes the current level; from the top level it returns focus to the pill
- `Tab` closes everything and moves on
- Clicking outside closes everything

Focus must return to the pill on every close path, or keyboard users are
stranded at the top of the document.

## Error handling

There is no new failure mode at runtime: `--effort` cannot make the CLI fail,
only warn. The risks are a bad value reaching argv (blocked at the IPC
boundary, see above) and the UI showing an effort that did not run (prevented by
recording the value that was sent, not the value currently in the picker).

The migration runs inside the existing `PRAGMA user_version` transaction; a
failure leaves the database at version 2 and the app reports it through the
existing DB error path.

## Testing

`test/smoke.cjs`:

- `unknown effort rejected` — `ask({ effort: 'turbo' })` returns `INVALID_INPUT`,
  mirroring the existing `unknown model rejected` check
- a real turn with `effort: 'low'`, asserting `message.effort === 'low'` and
  `conversation.lastEffort === 'low'`

`test/ui.cjs`:

- clicking the pill opens the menu; choosing an effort updates the pill text
- `Escape` closes the menu and focus returns to the pill

Existing assertions must keep passing untouched — in particular the composer
strings `'⌘↵ to send'` and `button[title^="Send"]`.

## Files not touched

`src/preload/index.ts` and `index.d.ts` need no edits: the bridge passes
`AskRequest` through as a whole, so the new field rides along with the type.

## Files touched

| File | Change |
|---|---|
| `src/shared/types.ts` | `EFFORTS`, `EffortId`, `isEffortId`; new fields; `MODELS` hints |
| `src/main/db/schema.ts` | migration 3 |
| `src/main/db/queries.ts` | read/write `effort`, `last_effort` |
| `src/main/ipc/register.ts` | validate and forward effort |
| `src/main/claude/runner.ts` | `--effort` flag |
| `src/renderer/src/components/chat/ChatPane.tsx` | effort state, seeded from the conversation |
| `src/renderer/src/components/chat/Composer.tsx` | pass effort through |
| `src/renderer/src/components/chat/ModelPicker.tsx` | → `RunSettings.tsx` |
| `src/renderer/src/components/ui/Popover.tsx` | new |
| `src/renderer/src/components/chat/Turn.tsx` | show effort in the meta row |
| `test/smoke.cjs`, `test/ui.cjs` | new checks |
