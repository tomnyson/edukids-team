# Classroom scene and EduKids Team name — design

Date: 2026-11-17. Size: a small change.

## Intent

Ahead of Vietnamese Teachers' Day (20 November), the 3D view should show the agents at work in a
classroom rather than an office, with a greeting on the board, and the app should present itself
as "EduKids Team" with the EduKids mark. The classroom stands for one at FPT Polytechnic college;
a symbolic likeness is enough.

## Goals

- The 3D room reads as a classroom: a green board on the back wall, a teacher's desk in front of
  it, student desks facing the board.
- The board carries the greeting "Chúc mừng Ngày Nhà giáo Việt Nam 20/11", with correct
  Vietnamese diacritics.
- A plain "FPT Polytechnic" wordmark on an orange band on the back wall, beside the board. (First
  planned for a side wall; from the camera's usual angle that wall is too foreshortened to read.)
- Every place the interface shows "Claude GUI" or the bot-face mark shows "EduKids Team" and the
  new logo instead.

## Non-goals

- An accurate model of a real FPT Polytechnic room, or its official logo artwork.
- A choice between office and classroom. The classroom replaces the office.
- Changing how agents, statuses, labels, thinking dots or the sidebar behave.

## Anti-goals

- Losing the user's history or saved provider keys. `productName` and `appId` stay as they are,
  because Electron derives the `userData` folder and the Keychain entry from the product name.
  The Dock and the menu bar therefore still say "Claude GUI".
- Anything fetched from the network to draw the scene.

## Approaches

1. **Rework the existing room in place (chosen).** Smallest change; touches the furniture, the
   palette and the desk layout only. The office look is gone, and the greeting goes stale after
   the 20th, so its text lives in one constant.
2. **Add an Office / Classroom choice.** Keeps both rooms, at the cost of a second scene, another
   remembered preference and its tests. Not wanted for a seasonal, symbolic change.

Chosen by the user (through their Telegram bridge): approach 1, the greeting in a constant,
display name only.

## Design

**Board text.** Drawn on a 2D canvas with a system font and applied as a `CanvasTexture` on a
plane just in front of the board. This keeps the diacritics right and needs no network; drei's
`Text` was rejected because it loads its font from a CDN. The same helper draws the wall wordmark.
Greeting and wordmark are constants in a new `lib/office/classroom.ts`.

**Room.** In `OfficeFurniture.tsx`, `Room` gains the board (frame, green surface, chalk tray) on
the back wall and the orange band beside it. `Desk` becomes a student desk; the lead keeps a
larger teacher's desk. Each stays a small component; if the file passes about 300 lines the board
moves to its own file.

**Layout.** In `layout.ts` the lead's spot stays at the back, in front of the board, turned to
face the class; the other desks keep their two rows and face the board. The existing rules hold:
at most `MAX_DESKS`, inside the floor, at least `MIN_DESK_GAP` apart, clear of the door. Any new
value the scene needs (which way a seat faces) is returned by `deskSpots` and tested first in
`test/office-state.test.cjs`.

**Name.** A single `APP_NAME = 'EduKids Team'` in `src/shared/` replaces the literal in
`Sidebar.tsx`, `SettingsDialog.tsx`, `AppMark.tsx`, `ChatHeader.tsx`; the `index.html` title is
changed by hand. The microphone message in `useDictation.ts` keeps "Claude GUI": it tells the
user which entry to allow in System Settings, and that entry carries the product name. The view switch reads "Classroom" instead of "Office".

**Logo.** `~/Downloads/edukids-tech-avatar.jpg` (the "ET" mark) is copied into
`src/renderer/src/assets/` and `AppMark` renders it as an image, keeping its `className` prop so
the three call sites are untouched. `build/icon.png`, `build/icon.icns`, `build/icon.ico` and
`resources/icon.png` are regenerated from the same picture. This is the builder's pick of logo,
not the user's; the green elephant "EduKids Tây Nguyên" picture is the alternative.

## Left to the builder

Exact sizes, colours and positions in the room; the wording of the Settings hint line under the
new name; how the icon files are produced (`sips` and `iconutil` are on the machine).

## Checks

`npm test`, `npm run typecheck`, lint on touched files, `electron-vite build`, and a look at the
built app on a throwaway `userData` folder (day and night lighting, one agent working). Nothing
is committed; the user splits and commits the work.
