/**
 * End-to-end smoke test. Boots the real main bundle, drives the app through the
 * actual preload bridge from inside the renderer, and captures a screenshot.
 * Run with: npm run smoke
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const OUT_DIR = process.env.SMOKE_OUT || app.getPath('temp')
const steps = []

const record = (name, passed, detail) => {
  steps.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// Boot the production main process exactly as the app does.
require('../out/main/index.js')

const settled = (window) =>
  new Promise((resolve) => {
    if (!window.webContents.isLoading()) return resolve()
    window.webContents.once('did-finish-load', resolve)
  })

const waitForWindow = async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [window] = BrowserWindow.getAllWindows()
    if (window) return window
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('No BrowserWindow appeared within 10s')
}

const evaluate = (window, expression) =>
  window.webContents.executeJavaScript(`(async () => { ${expression} })()`, true)

async function run() {
  const window = await waitForWindow()
  await settled(window)
  record('window loads renderer', true, window.webContents.getURL().split('/').pop())

  const bridged = await evaluate(window, 'return typeof window.api?.ask === "function"')
  record('preload bridge exposes api', bridged === true)

  const info = await evaluate(window, 'return await window.api.systemInfo()')
  record(
    'claude binary resolved',
    info.ok && info.data.claudeBinary !== null,
    info.ok ? info.data.claudeBinary : 'ipc failed'
  )

  const created = await evaluate(
    window,
    'return await window.api.createConversation({ title: "Smoke test" })'
  )
  record(
    'conversation created',
    created.ok,
    created.ok ? `id=${created.data.id}` : created.error?.message
  )
  if (!created.ok) return finish(window)
  const id = created.data.id

  const listed = await evaluate(window, 'return await window.api.listConversations()')
  record('conversation listed', listed.ok && listed.data.some((c) => c.id === id))

  const rejected = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "   " })`
  )
  record(
    'blank prompt rejected',
    !rejected.ok && rejected.error.code === 'INVALID_INPUT',
    rejected.error?.code
  )

  console.log('...asking the real CLI, this takes a few seconds')
  const asked = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "Reply with exactly: SMOKE_OK" })`
  )
  record(
    'cli round trip',
    asked.ok && asked.data.message.response.includes('SMOKE_OK'),
    asked.ok
      ? JSON.stringify(asked.data.message.response.slice(0, 80))
      : `${asked.error.code}: ${asked.error.message}`
  )

  const persisted = await evaluate(window, `return await window.api.listMessages(${id})`)
  record(
    'response persisted to sqlite',
    persisted.ok && persisted.data.length === 1,
    persisted.ok ? `${persisted.data.length} row(s)` : ''
  )

  const titled = await evaluate(window, 'return await window.api.listConversations()')
  const target = titled.ok ? titled.data.find((c) => c.id === id) : null
  record('session marked resumable', target?.sessionStarted === true)

  // Second turn proves --resume keeps context across CLI invocations.
  console.log('...second turn to verify session resume')
  const followUp = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "What exact word did I ask you to reply with? Answer with just that word." })`
  )
  record(
    'session context carried over',
    followUp.ok && followUp.data.message.response.includes('SMOKE_OK'),
    followUp.ok
      ? JSON.stringify(followUp.data.message.response.slice(0, 80))
      : followUp.error.message
  )

  // Effort rides the same path as the model and must survive it end to end.
  console.log('...third turn with --effort low')
  const withEffort = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "Reply with exactly: OK", effort: "low" })`
  )
  record(
    'effort recorded on the turn',
    withEffort.ok && withEffort.data.message.effort === 'low',
    withEffort.ok ? String(withEffort.data.message.effort) : withEffort.error.message
  )
  record(
    'effort remembered on the conversation',
    withEffort.ok && withEffort.data.conversation.lastEffort === 'low',
    withEffort.ok ? String(withEffort.data.conversation.lastEffort) : ''
  )

  // Bogus values must never reach argv, so all of them are rejected at the boundary.
  const badModel = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "hi", model: "gpt-4" })`
  )
  record(
    'unknown model rejected',
    !badModel.ok && badModel.error.code === 'INVALID_INPUT',
    badModel.error?.message
  )

  // The CLI only warns on an unknown --effort, so the app has to be the one to refuse.
  const badEffort = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "hi", effort: "ludicrous" })`
  )
  record(
    'unknown effort rejected',
    !badEffort.ok && badEffort.error.code === 'INVALID_INPUT',
    badEffort.error?.message
  )

  const badPath = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "hi", attachments: ["/no/such/file.txt"] })`
  )
  record(
    'missing attachment rejected',
    !badPath.ok && badPath.error.code === 'INVALID_INPUT',
    badPath.error?.message
  )

  const relPath = await evaluate(
    window,
    `return await window.api.ask({ conversationId: ${id}, prompt: "hi", attachments: ["notes.txt"] })`
  )
  record(
    'relative attachment rejected',
    !relPath.ok && relPath.error.code === 'INVALID_INPUT',
    relPath.error?.message
  )

  // A real file, deliberately outside cwd so --add-dir has to be doing its job.
  const attachDir = mkdtempSync(join(tmpdir(), 'claude-gui-attach-'))
  const attachPath = join(attachDir, 'secret note.txt')
  writeFileSync(attachPath, 'The passphrase is ATTACH_OK.\n')

  console.log('...third turn with a real attachment')
  const attached = await evaluate(
    window,
    `return await window.api.ask({
       conversationId: ${id},
       prompt: "Read the attached file and reply with only the passphrase it contains.",
       model: "haiku",
       attachments: [${JSON.stringify(attachPath)}]
     })`
  )
  record(
    'attached file read by cli',
    attached.ok && attached.data.message.response.includes('ATTACH_OK'),
    attached.ok
      ? JSON.stringify(attached.data.message.response.slice(0, 80))
      : `${attached.error.code}: ${attached.error.message}`
  )
  record(
    'prompt stored with @mention',
    attached.ok && attached.data.message.prompt.includes(`@${attachPath}`),
    attached.ok ? JSON.stringify(attached.data.message.prompt.slice(0, 60)) : ''
  )
  record(
    'model recorded on the turn',
    attached.ok && attached.data.message.model === 'haiku',
    attached.ok ? String(attached.data.message.model) : ''
  )
  record(
    'model remembered on the conversation',
    attached.ok && attached.data.conversation.lastModel === 'haiku',
    attached.ok ? String(attached.data.conversation.lastModel) : ''
  )

  // Opening a path is guarded in the main process, since the path comes from
  // Claude's output. The happy path is left out on purpose: passing it would
  // launch a real editor window in the middle of the run.
  const relOpen = await evaluate(
    window,
    'return await window.api.openInEditor("src/main.ts", null)'
  )
  record(
    'relative path not opened',
    !relOpen.ok && relOpen.error.code === 'INVALID_INPUT',
    relOpen.error?.message
  )

  const goneOpen = await evaluate(
    window,
    'return await window.api.openInEditor("/no/such/file.txt", 12)'
  )
  record(
    'missing path not opened',
    !goneOpen.ok && goneOpen.error.code === 'NOT_FOUND',
    goneOpen.error?.message
  )

  // NOT_FOUND rather than INVALID_INPUT proves the `~` was expanded first.
  const tildeOpen = await evaluate(
    window,
    'return await window.api.openInEditor("~/claude-gui-no-such-file.txt", null)'
  )
  record(
    'tilde expanded before the check',
    !tildeOpen.ok && tildeOpen.error.code === 'NOT_FOUND',
    tildeOpen.error?.message
  )

  const emptyOpen = await evaluate(window, 'return await window.api.openInEditor("  ", null)')
  record(
    'blank path not opened',
    !emptyOpen.ok && emptyOpen.error.code === 'INVALID_INPUT',
    emptyOpen.error?.message
  )

  // --- projects ---------------------------------------------------------------
  const projects = await evaluate(window, 'return await window.api.listProjects()')
  record(
    'projects listed',
    projects.ok && Array.isArray(projects.data),
    projects.ok ? `${projects.data.length} project(s)` : projects.error?.message
  )

  const ghost = await evaluate(
    window,
    'return await window.api.createConversation({ projectId: 987654 })'
  )
  record(
    'chat in an unknown project refused',
    !ghost.ok && ghost.error.code === 'NOT_FOUND',
    ghost.error?.message
  )

  const ghostPatch = await evaluate(
    window,
    'return await window.api.updateProject(987654, { name: "nope" })'
  )
  record(
    'unknown project not updatable',
    !ghostPatch.ok && ghostPatch.error.code === 'NOT_FOUND',
    ghostPatch.error?.message
  )

  const first = projects.ok ? projects.data[0] : null
  if (first) {
    const longName = await evaluate(
      window,
      `return await window.api.updateProject(${first.id}, { name: ${JSON.stringify('n'.repeat(400))} })`
    )
    record(
      'project name length capped',
      !longName.ok && longName.error.code === 'INVALID_INPUT',
      longName.error?.message
    )

    // A chat started from a project must run in that project's folder.
    const inProject = await evaluate(
      window,
      `return await window.api.createConversation({ title: "Smoke project chat", projectId: ${first.id} })`
    )
    record(
      'new chat inherits the project folder',
      inProject.ok && inProject.data.cwd === first.path && inProject.data.projectId === first.id,
      inProject.ok ? inProject.data.cwd : inProject.error?.message
    )
    if (inProject.ok) {
      await evaluate(window, `return await window.api.deleteConversation(${inProject.data.id})`)
    }
  }

  // --- settings -------------------------------------------------------------
  const before = await evaluate(window, 'return await window.api.getSettings()')
  record(
    'settings readable',
    before.ok && typeof before.data.theme === 'string' && typeof before.data.voice === 'object',
    before.ok ? `theme=${before.data.theme}` : before.error?.message
  )
  const original = before.ok ? before.data.theme : 'dark'

  // Everything here is junk: the store must keep a working config regardless.
  const junk = await evaluate(
    window,
    `return await window.api.updateSettings({ theme: "neon", defaultModel: "gpt-4", sendKey: 7, bogus: true, voice: { backend: "telepathy", language: "vietnamese" } })`
  )
  record(
    'bad settings fall back to defaults',
    junk.ok &&
      junk.data.theme === original &&
      junk.data.defaultModel === null &&
      junk.data.sendKey === 'enter' &&
      junk.data.voice.backend === 'local' &&
      junk.data.voice.language === 'auto',
    junk.ok ? JSON.stringify(junk.data.voice) : junk.error?.message
  )

  record('unknown settings keys dropped', junk.ok && junk.data.bogus === undefined)

  const themed = await evaluate(
    window,
    'return await window.api.updateSettings({ theme: "light", defaultEffort: "high" })'
  )
  const reread = await evaluate(window, 'return await window.api.getSettings()')
  record(
    'settings persist across reads',
    themed.ok && reread.ok && reread.data.theme === 'light' && reread.data.defaultEffort === 'high',
    reread.ok ? `${reread.data.theme}/${reread.data.defaultEffort}` : reread.error?.message
  )

  const blankKey = await evaluate(window, 'return await window.api.setVoiceApiKey("   ")')
  record(
    'blank api key rejected',
    !blankKey.ok && blankKey.error.code === 'INVALID_INPUT',
    blankKey.error?.message
  )

  const stored = await evaluate(
    window,
    'return await window.api.setVoiceApiKey("sk-smoke-test-key-not-real")'
  )
  const view = await evaluate(window, 'return await window.api.getSettings()')
  // Stored or refused is fine; leaking the key is not.
  record(
    'api key never crosses the bridge',
    view.ok && !('voiceApiKey' in view.data) && !JSON.stringify(view.data).includes('sk-smoke'),
    stored.ok ? `configured=${view.ok && view.data.voiceKeyConfigured}` : stored.error?.message
  )

  const cleared = await evaluate(window, 'return await window.api.setVoiceApiKey(null)')
  record(
    'api key can be cleared',
    cleared.ok && cleared.data.voiceKeyConfigured === false,
    cleared.ok ? '' : cleared.error?.message
  )

  // Leave the machine as we found it.
  await evaluate(
    window,
    `return await window.api.updateSettings({ theme: ${JSON.stringify(original)}, defaultEffort: null })`
  )

  await finish(window)
}

async function finish(window) {
  const image = await window.webContents.capturePage()
  const shot = join(OUT_DIR, 'smoke.png')
  writeFileSync(shot, image.toPNG())
  console.log(`\nscreenshot: ${shot}`)

  const failed = steps.filter((step) => !step.passed)
  console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`)
  app.exit(failed.length === 0 ? 0 : 1)
}

app.whenReady().then(() =>
  run().catch((error) => {
    console.error('smoke test crashed:', error)
    app.exit(1)
  })
)
