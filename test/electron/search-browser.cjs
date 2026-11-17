/**
 * Runs the hidden browser for real, inside Electron, against two local servers: one stands in
 * for a public site, the other for something on the local network that a page must never reach.
 *
 *   npx electron test/electron/search-browser.cjs
 *
 * It uses a throwaway profile folder and never opens the app or its database.
 */
const assert = require('assert')
const http = require('http')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { buildSync } = require('esbuild')

const root = path.join(__dirname, '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'search-browser-test-'))
app.setPath('userData', path.join(work, 'profile'))

// The module is TypeScript with the bundler's alias, so it is bundled the way the app's build does
const bundle = path.join(work, 'browser.cjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/search/browser.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  alias: { '@shared': path.join(root, 'src/shared') },
  logLevel: 'silent'
})
const { createPageReader } = require(bundle)

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

const html = (response, body) =>
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)

async function main() {
  // The "local network": every request that reaches it is a failure of the guard
  const privateHits = []
  const privateServer = await listen((request, response) => {
    privateHits.push(request.url)
    response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' })
    response.end('SECRET')
  })
  const privateOrigin = `http://127.0.0.1:${privateServer.address().port}`

  const publicHits = []
  const publicServer = await listen((request, response) => {
    const { pathname } = new URL(request.url, 'http://x')
    publicHits.push(pathname)
    if (pathname === '/page') {
      return html(
        response,
        `<title>Fixture page</title><body><h1>Hello reader</h1>
         <a href="https://one.example/a">First link</a><a href="/other">Second</a>
         <img src="/pixel.png"><script>document.body.append(' script-ran')</script></body>`
      )
    }
    if (pathname === '/redirect-private') {
      return response.writeHead(302, { location: `${privateOrigin}/via-redirect` }).end()
    }
    if (pathname === '/fetch-private') {
      return html(
        response,
        `<title>Reaches inward</title><body>start<script>
           fetch('${privateOrigin}/via-fetch').then(r => r.text())
             .then(t => document.body.append(' LEAK:' + t), () => document.body.append(' fetch-blocked'))
           const frame = document.createElement('iframe'); frame.src = '${privateOrigin}/via-frame'
           document.body.append(frame)
           const script = document.createElement('script'); script.src = '${privateOrigin}/via-script'
           document.body.append(script)
         </script></body>`
      )
    }
    if (pathname === '/popup') {
      return html(
        response,
        `<title>Popup</title><body>popup page<script>
           const opened = window.open('/opened'); document.body.append(opened ? ' opened' : ' popup-denied')
         </script></body>`
      )
    }
    if (pathname === '/download') {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="payload.bin"'
      })
      return response.end('binary')
    }
    if (pathname === '/tampered') {
      return html(
        response,
        `<title>Tampered</title><body>real text<script>
           Array.from = () => [{ href: 'javascript:alert(1)', innerText: 'forged' }]
           String.prototype.slice = () => 'forged text'
         </script></body>`
      )
    }
    if (pathname === '/hang') return undefined // never answers
    response.writeHead(404).end()
  })
  const publicOrigin = `http://127.0.0.1:${publicServer.address().port}`

  const reader = createPageReader({ allowOrigins: [publicOrigin], loadTimeoutMs: 1500 })
  const signal = new AbortController().signal
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const step = (name) => process.env.SEARCH_TEST_VERBOSE && console.log('step:', name)

  try {
    step('read')
    // A page is read: title, visible text including what its script wrote, and its links
    const page = await reader.load(`${publicOrigin}/page`, signal)
    assert.strictEqual(page.title, 'Fixture page')
    assert.ok(page.text.includes('Hello reader'))
    assert.ok(page.text.includes('script-ran'))
    assert.deepStrictEqual(
      page.links.map((link) => link.href),
      ['https://one.example/a', `${publicOrigin}/other`]
    )
    // Images are never fetched
    assert.ok(!publicHits.includes('/pixel.png'), 'image was requested')

    step('direct')
    // A local address asked for directly is refused before anything loads
    await assert.rejects(reader.load(`${privateOrigin}/direct`, signal), /local/i)

    step('redirect')
    // A public page that redirects inward: the redirect is cancelled
    await assert.rejects(reader.load(`${publicOrigin}/redirect-private`, signal))

    step('inward')
    // A public page whose scripts reach inward by fetch, frame and script tag
    const inward = await reader.load(`${publicOrigin}/fetch-private`, signal)
    await settle(300)
    assert.ok(!inward.text.includes('LEAK'), 'page read a local response')

    step('popup')
    // Popups are denied; the page itself still reads
    const popup = await reader.load(`${publicOrigin}/popup`, signal)
    assert.ok(popup.text.includes('popup-denied'), popup.text)
    assert.ok(!publicHits.includes('/opened'))

    step('download')
    // A download is cancelled and never lands on disk
    await reader.load(`${publicOrigin}/download`, signal).catch(() => undefined)
    await settle(300)
    const downloads = app.getPath('downloads')
    assert.ok(!fs.existsSync(path.join(downloads, 'payload.bin')), 'a file was downloaded')

    step('tampered')
    // A page that rewrites built-ins cannot forge what is read: the reader runs apart from it
    const tampered = await reader.load(`${publicOrigin}/tampered`, signal)
    assert.ok(tampered.text.includes('real text'), tampered.text)
    assert.ok(!tampered.text.includes('forged'))
    assert.deepStrictEqual(tampered.links, [])

    step('hang')
    // A page that never answers is given up on, and the next page still loads
    const started = Date.now()
    // It must fail rather than hand back the text of the page loaded before it
    await assert.rejects(reader.load(`${publicOrigin}/hang`, signal), /too long/i)
    assert.ok(Date.now() - started < 8000, 'the hung page was waited on too long')
    const after = await reader.load(`${publicOrigin}/page`, signal)
    assert.strictEqual(after.title, 'Fixture page')

    step('stop')
    // A stop ends a load at once
    const stop = new AbortController()
    const stopping = reader.load(`${publicOrigin}/hang`, stop.signal)
    stop.abort()
    await assert.rejects(stopping)

    step('final')
    // Through all of it, nothing reached the local server
    assert.deepStrictEqual(privateHits, [])
  } finally {
    reader.close()
    publicServer.closeAllConnections()
    publicServer.close()
    privateServer.close()
  }
}

app.dock?.hide()
// The reader replaces its window after a failed page; with no other window open, Electron would
// take the gap between the two as the last window closing and quit
app.on('window-all-closed', () => {})
app.whenReady().then(() =>
  main().then(
    () => {
      console.log('search browser tests passed')
      app.exit(0)
    },
    (error) => {
      console.error(error)
      app.exit(1)
    }
  )
)
