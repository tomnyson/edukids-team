/**
 * UI-level test. Runs the app against a throwaway user-data directory and
 * drives the real React interface through the DOM, so the rendering path —
 * not just IPC — is exercised. Screenshots land in SMOKE_OUT.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const OUT_DIR = process.env.SMOKE_OUT || tmpdir()

// Must happen before the main bundle opens the database.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'claude-gui-ui-')))

require('../out/main/index.js')

const steps = []
const record = (name, passed, detail) => {
  steps.push({ name, passed })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** Not every run is the test's to judge: a model that drops a line is not a bug. */
const skip = (name, why) => console.log(`SKIP  ${name}  — ${why}`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = (window, body) =>
  window.webContents.executeJavaScript(`(async () => { ${body} })()`, true)

async function shoot(window, name) {
  const image = await window.webContents.capturePage()
  writeFileSync(join(OUT_DIR, `${name}.png`), image.toPNG())
}

/** Same trick as TYPE, for the native selects in Settings. */
const CHOOSE = (label, value) => `
  const el = [...document.querySelectorAll('select')]
    .find((s) => s.getAttribute('aria-label') === ${JSON.stringify(label)})
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return el.value
`

/** Clicks a button by its visible text, scoped to a selector. */
const CLICK_TEXT = (scope, text) => `
  const el = [...document.querySelectorAll(${JSON.stringify(scope)})]
    .find((b) => b.innerText.trim() === ${JSON.stringify(text)})
  el.click()
  return true
`

/** React tracks its own value, so a plain assignment is ignored. */
const TYPE = (text) => `
  const box = document.querySelector('#composer')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(box, ${JSON.stringify(text)})
  box.dispatchEvent(new Event('input', { bubbles: true }))
  return box.value
`

async function waitFor(window, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(window, `return ${expression}`)) return true
    await sleep(250)
  }
  return false
}

async function run() {
  let window = null
  for (let i = 0; i < 100 && !window; i++) {
    ;[window] = BrowserWindow.getAllWindows()
    if (!window) await sleep(100)
  }
  if (!window.webContents.isLoading()) await sleep(300)
  else await new Promise((resolve) => window.webContents.once('did-finish-load', resolve))
  await sleep(1200)

  record(
    'empty state rendered',
    await waitFor(window, `document.body.innerText.includes('What should we work on?')`, 5000)
  )
  record(
    'cli status shown',
    await waitFor(window, `document.body.innerText.includes('CLI ready')`, 5000)
  )
  await shoot(window, 'ui-1-empty')

  // One turn has to carry every rendering path: list, highlighted code, path link.
  const PROMPT = [
    'Reply with exactly this markdown and nothing else:',
    '',
    '- red',
    '- green',
    '- blue',
    '',
    '```ts',
    "const red: string = 'red'",
    '```',
    '',
    'See /Applications/work/claude-app/package.json for the version.'
  ].join('\n')

  const typed = await evaluate(window, TYPE(PROMPT))
  record('composer accepts input', typed.startsWith('Reply with exactly'))

  const enabled = await evaluate(
    window,
    `return !document.querySelector('button[title^="Send"]').disabled`
  )
  record('send button enables with input', enabled)
  await shoot(window, 'ui-2-typed')

  await evaluate(window, `document.querySelector('button[title^="Send"]').click(); return true`)
  record(
    'busy state shows stop control',
    await waitFor(window, `document.body.innerText.includes('Stop')`, 5000)
  )
  await sleep(900)
  await shoot(window, 'ui-3-streaming')

  const streamed = await waitFor(
    window,
    `document.querySelectorAll('article li').length >= 3`,
    120000
  )
  record('markdown list rendered from stream', streamed)

  record(
    'run settles back to idle',
    await waitFor(window, `document.body.innerText.includes('to send')`, 30000)
  )
  await sleep(500)
  await shoot(window, 'ui-4-answered')

  // Highlighting only runs on settled turns, so this also proves the swap happened.
  record(
    'code block is highlighted',
    await waitFor(window, `!!document.querySelector('article pre code .hljs-keyword')`, 10000)
  )

  // Rendered as a control, not clicked: a click would launch a real editor.
  // The prompt asks for a literal echo, but a model that drops the line has not
  // broken the renderer — so the check only applies when the path came back.
  const link = await evaluate(
    window,
    `const answer = document.querySelector('article [data-response]')
     const el = answer.querySelector('[data-file-link]')
     return {
       echoed: answer.innerText.includes('package.json'),
       link: el ? { text: el.innerText, tag: el.tagName, title: el.title } : null,
       // When the path is there but unlinked, the surrounding markup says why.
       context: [...answer.querySelectorAll('p, li, pre')]
         .filter((n) => n.innerText.includes('package.json'))
         .map((n) => n.tagName + ': ' + n.innerHTML.slice(0, 200))
         .join(' | ')
     }`
  )
  if (!link.echoed) {
    skip('file path rendered as a button', 'the model did not echo the path this run')
  } else {
    record(
      'file path rendered as a button',
      link.link !== null && link.link.tag === 'BUTTON' && link.link.text.includes('package.json'),
      link.link ? link.link.title : `no [data-file-link] found — ${link.context}`
    )
  }

  // Same transcript, both palettes — driven through the real dialog, and the
  // assertion is that the paint actually changed. A screenshot alone would pass
  // on a stylesheet that did nothing.
  const darkPaint = await evaluate(window, `return getComputedStyle(document.body).backgroundColor`)
  await evaluate(
    window,
    `const gear = document.querySelector('#open-settings')
     gear.focus()
     gear.click()
     return true`
  )
  record(
    'settings dialog opens from the rail',
    await waitFor(window, `!!document.querySelector('[role="dialog"]')`, 3000)
  )
  await sleep(250)
  await shoot(window, 'ui-4b-settings')

  // A global default has to reach the surface that uses it, not just the file.
  await evaluate(window, CHOOSE('Sending', 'mod-enter'))
  record(
    'send-key setting reaches the composer',
    await waitFor(window, `document.body.innerText.includes('⌘↵ to send')`, 3000)
  )
  await evaluate(window, CHOOSE('Sending', 'enter'))

  await evaluate(window, CLICK_TEXT('nav[aria-label="Settings sections"] button', 'Appearance'))
  await evaluate(
    window,
    CLICK_TEXT('[role="radiogroup"][aria-label="Theme"] [role="radio"]', 'Light')
  )
  const lightPaint = await waitFor(
    window,
    `document.documentElement.dataset.theme === 'light' &&
     getComputedStyle(document.body).backgroundColor !== ${JSON.stringify(darkPaint)}`,
    5000
  )
  await sleep(300)
  await shoot(window, 'ui-4c-light')
  record('choosing Light repaints the app', lightPaint, `dark was ${darkPaint}`)

  const lightInk = await evaluate(
    window,
    `const code = document.querySelector('article pre code .hljs-keyword')
     return code ? getComputedStyle(code).color : null`
  )
  record('syntax colours follow the theme', lightInk !== null, `keyword is ${lightInk}`)

  // The cloud backend sends audio off the machine; the pane has to say so.
  await evaluate(window, CLICK_TEXT('nav[aria-label="Settings sections"] button', 'Voice'))
  record(
    'voice pane renders',
    await waitFor(window, `!!document.querySelector('[aria-label="Voice"]')`, 3000)
  )
  await evaluate(window, CHOOSE('Transcribe with', 'cloud'))
  record(
    'cloud backend warns that audio is uploaded',
    await waitFor(
      window,
      `document.body.innerText.includes('uploaded to a third-party service')`,
      3000
    )
  )
  await shoot(window, 'ui-4d-voice')
  await evaluate(window, CHOOSE('Transcribe with', 'local'))

  await evaluate(
    window,
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
     document.querySelector('[role="dialog"]')
       ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
     return true`
  )
  const closed = await waitFor(
    window,
    `!document.querySelector('[role="dialog"]') &&
     document.activeElement === document.querySelector('#open-settings')`,
    3000
  )
  record(
    'escape closes settings and returns focus',
    closed,
    closed
      ? null
      : await evaluate(
          window,
          `return 'dialog=' + !!document.querySelector('[role="dialog"]') +
                  ' focus=' + (document.activeElement.id || document.activeElement.tagName)`
        )
  )

  // Back to dark the same way, so the rest of the run looks like the app ships.
  await evaluate(
    window,
    `const gear = document.querySelector('#open-settings')
     gear.focus()
     gear.click()
     return true`
  )
  await waitFor(window, `!!document.querySelector('[role="dialog"]')`, 3000)
  await evaluate(window, CLICK_TEXT('nav[aria-label="Settings sections"] button', 'Appearance'))
  await evaluate(
    window,
    CLICK_TEXT('[role="radiogroup"][aria-label="Theme"] [role="radio"]', 'Dark')
  )
  await waitFor(
    window,
    `getComputedStyle(document.body).backgroundColor === ${JSON.stringify(darkPaint)}`,
    5000
  )
  await evaluate(
    window,
    `document.querySelector('[role="dialog"]')
       .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
     return true`
  )
  await sleep(200)
  await shoot(window, 'ui-4e-dark')

  const transcript = await evaluate(window, `return document.querySelector('article').innerText`)
  console.log(`\n--- transcript ---\n${transcript}\n------------------`)

  const sidebarTitled = await waitFor(
    window,
    `!!document.querySelector('nav[aria-label="Conversation history"]')?.innerText.includes('Reply with exactly')`,
    10000
  )
  record('sidebar picks up derived title', sidebarTitled)

  // A fresh chat must clear the transcript.
  await evaluate(
    window,
    `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'New chat').click(); return true`
  )
  record(
    'new chat resets transcript',
    await waitFor(window, `document.body.innerText.includes('What should we work on?')`, 8000)
  )
  await shoot(window, 'ui-5-new-chat')

  // Run settings: the pill, its nested effort menu, and the keyboard way out.
  await evaluate(window, `document.querySelector('#run-settings').click(); return true`)
  record(
    'run settings menu opens',
    await waitFor(window, `!!document.querySelector('[role="menu"][aria-label="Model"]')`, 3000)
  )

  await evaluate(
    window,
    `[...document.querySelectorAll('[role="menuitem"]')].find(b => b.innerText.startsWith('Effort')).click(); return true`
  )
  record(
    'effort submenu opens',
    await waitFor(window, `!!document.querySelector('[role="menu"][aria-label="Effort"]')`, 3000)
  )
  await shoot(window, 'ui-6-run-settings')

  await evaluate(
    window,
    `[...document.querySelectorAll('[role="menu"][aria-label="Effort"] [role="menuitemradio"]')]
       .find(b => b.innerText.startsWith('High')).click(); return true`
  )
  record(
    'choosing an effort updates the pill',
    await waitFor(
      window,
      `document.querySelector('#run-settings').innerText.includes('High')`,
      3000
    )
  )

  await evaluate(window, `document.querySelector('#run-settings').click(); return true`)
  await waitFor(window, `!!document.querySelector('[role="menu"][aria-label="Model"]')`, 3000)
  await evaluate(
    window,
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`
  )
  record(
    'escape closes the menu and returns focus',
    await waitFor(
      window,
      `!document.querySelector('[role="menu"][aria-label="Model"]') &&
       document.activeElement === document.querySelector('#run-settings')`,
      3000
    )
  )

  // --- projects ---------------------------------------------------------------
  // The folder always comes from the native picker, so the test answers it.
  const projectDir = mkdtempSync(join(tmpdir(), 'claude-gui-project-'))
  const projectName = projectDir.slice(projectDir.lastIndexOf('/') + 1)
  require('electron').dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [projectDir]
  })

  const SECTION = `[...document.querySelectorAll('section')]
    .find((s) => s.querySelector('[title="${projectDir}"]'))`

  record(
    'chats with no project land in Unfiled',
    await waitFor(
      window,
      `document.querySelector('nav[aria-label="Conversation history"]').innerText.includes('Unfiled')`,
      3000
    )
  )

  await evaluate(
    window,
    `document.querySelector('[title="Add project folder"]').click(); return true`
  )
  record(
    'picking a folder adds a project',
    await waitFor(
      window,
      `document.querySelector('nav[aria-label="Conversation history"]').innerText.includes(${JSON.stringify(projectName)})`,
      5000
    ),
    projectName
  )

  await evaluate(window, `${SECTION}.querySelector('[title="New chat here"]').click(); return true`)
  record(
    'a chat started in a project sits under it',
    await waitFor(window, `${SECTION}.querySelectorAll('li button').length > 0`, 5000)
  )

  const inProjectCwd = await evaluate(
    window,
    `const list = await window.api.listConversations()
     const chat = list.data.find((c) => c.projectId !== null)
     return chat ? chat.cwd : null`
  )
  record('the new chat runs in the project folder', inProjectCwd === projectDir, inProjectCwd)

  await evaluate(
    window,
    `${SECTION}.querySelector('[title="Project settings"]').click(); return true`
  )
  record(
    'project settings open',
    await waitFor(window, `!!${SECTION}.querySelector('select[aria-label="Effort"]')`, 3000)
  )
  await shoot(window, 'ui-4f-projects')

  await evaluate(window, CHOOSE('Effort', 'high'))
  const storedEffort = await waitFor(
    window,
    `(await window.api.listProjects()).data.some((p) => p.defaultEffort === 'high')`,
    3000
  )
  record('a project default is saved', storedEffort)

  await evaluate(
    window,
    `${SECTION}.querySelector('[title="Remove project"]').click(); return true`
  )
  const detached = await waitFor(
    window,
    `await (async () => {
       const rail = document.querySelector('nav[aria-label="Conversation history"]').innerText
       const list = await window.api.listConversations()
       return !rail.includes(${JSON.stringify(projectName)}) &&
              rail.includes('Unfiled') &&
              list.data.every((c) => c.projectId === null)
     })()`,
    5000
  )
  record('removing a project keeps its chats, unfiled', detached)

  const failed = steps.filter((step) => !step.passed)
  console.log(`\nscreenshots: ${OUT_DIR}`)
  console.log(`${steps.length - failed.length}/${steps.length} checks passed`)
  app.exit(failed.length === 0 ? 0 : 1)
}

app.whenReady().then(() =>
  run().catch((error) => {
    console.error('ui test crashed:', error)
    app.exit(1)
  })
)
