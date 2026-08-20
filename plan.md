# MISSION

You are an expert Full-Stack Desktop App Developer. Your task is to build a macOS desktop application that serves as a GUI wrapper for the "Claude CLI", utilizing SQLite for saving chat history.

# TECH STACK

- Frontend: React, TypeScript, TailwindCSS
- Backend/Desktop Framework: Electron (Main process & Renderer process)
- Database: `sqlite3` or `better-sqlite3`
- IPC: Electron IPC for Main <-> Renderer communication.

# APP FEATURES

1. A Chat UI (Main window) to input prompts and display Claude's Markdown responses.
2. A Sidebar UI to display the history of previous conversations.
3. A backend mechanism to execute Claude CLI directly via terminal commands and capture stdout/stderr.
4. Local storage of all prompts and responses in a SQLite database.

# DATABASE SCHEMA

Table: `chat_history`

- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `prompt` (TEXT) - The user's input.
- `response` (TEXT) - The output from Claude CLI.
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

# EXECUTION PLAN (Do this step by step, confirm with me after each step)

## STEP 1: Project Initialization

- Scaffold a new Electron + React + TypeScript project (e.g., using electron-vite).
- Install necessary dependencies: TailwindCSS (for UI), `better-sqlite3` (for DB), `lucide-react` (for icons), `react-markdown` (for parsing Claude's response).
- Configure TailwindCSS.

## STEP 2: Database Setup (Main Process)

- In the Electron Main process, initialize the SQLite database.
- Path should be user data folder: `app.getPath('userData') + '/history.db'`.
- Create a function to initialize the `chat_history` table if it doesn't exist.
- Create helper functions: `insertHistory(prompt, response)` and `getAllHistory()`.

## STEP 3: Claude CLI Wrapper & IPC (Main Process)

- Use Node.js `child_process.exec` or `spawn` to execute the Claude CLI command (e.g., `claude "user prompt"`).
- **CRITICAL MAC OS ISSUE:** GUI apps on macOS do not inherit the terminal `$PATH`. You MUST handle this by either finding the absolute path of the `claude` binary or using a package like `fix-path` to ensure the command can be found.
- Create an IPC Handler (`ipcMain.handle`) named `ask-claude` that receives the prompt, calls the CLI asynchronously, waits for the response, saves it to SQLite via `insertHistory`, and returns the response to the renderer.
- Create an IPC Handler named `get-history` to fetch the SQLite data.

## STEP 4: UI/UX Implementation (Renderer Process)

- Build a split-pane layout (Sidebar + Main Chat Area).
- **Sidebar:** Fetch and display the list of past prompts from `get-history` IPC. Sort by latest.
- **Main Chat:**
  - A text area for input.
  - A submit button (with a loading state spinner while waiting for the CLI).
  - A display area rendering the chat history and the current result using `react-markdown`.
- Expose the IPC methods securely via `preload.ts` (contextBridge).

## STEP 5: Refinement & Error Handling

- Add try/catch blocks for CLI execution errors (e.g., "command not found", network timeout).
- Display error messages gracefully in the UI.

Please start with STEP 1. Give me the terminal commands to run and the code to initialize the project.
