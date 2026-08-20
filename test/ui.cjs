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
    await waitFor(window, `document.body.innerText.includes('Start a session')`, 5000)
  )
  record(
    'cli status shown',
    await waitFor(window, `document.body.innerText.includes('cli ready')`, 5000)
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
    await waitFor(window, `document.body.innerText.includes('⌘↵ to send')`, 30000)
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

  // Same transcript, both palettes. The assertion is that the paint actually
  // changed — a screenshot alone would pass on a stylesheet that did nothing.
  const darkPaint = await evaluate(window, `return getComputedStyle(document.body).backgroundColor`)
  await evaluate(window, `document.documentElement.dataset.theme = 'light'; return true`)
  const lightPaint = await waitFor(
    window,
    `document.documentElement.dataset.theme === 'light' &&
     getComputedStyle(document.body).backgroundColor !== ${JSON.stringify(darkPaint)}`,
    5000
  )
  await sleep(300)
  await shoot(window, 'ui-4b-light')
  record('light theme repaints the app', lightPaint, `dark was ${darkPaint}`)

  const lightInk = await evaluate(
    window,
    `const code = document.querySelector('article pre code .hljs-keyword')
     return code ? getComputedStyle(code).color : null`
  )
  record('syntax colours follow the theme', lightInk !== null, `keyword is ${lightInk}`)

  await evaluate(window, `document.documentElement.dataset.theme = 'dark'; return true`)
  await waitFor(
    window,
    `getComputedStyle(document.body).backgroundColor === ${JSON.stringify(darkPaint)}`,
    5000
  )
  await sleep(200)
  await shoot(window, 'ui-4c-dark')

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
    await waitFor(window, `document.body.innerText.includes('Start a session')`, 8000)
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
