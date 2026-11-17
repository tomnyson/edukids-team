const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { permissionAllowed, isAppUrl } = require('../src/main/security/permission-policy.ts')

const DEV = 'http://localhost:5173'
const PACKAGED =
  'file:///Applications/Claude%20GUI.app/Contents/Resources/app.asar/out/renderer/index.html'

// The packaged renderer is a file: page whose origin is the string "null", so the URL decides
assert.strictEqual(isAppUrl(PACKAGED, null), true)
assert.strictEqual(isAppUrl(`${DEV}/`, DEV), true)
assert.strictEqual(isAppUrl(`${DEV}/index.html#chat`, DEV), true)
assert.strictEqual(isAppUrl('http://localhost:5174/', DEV), false)
assert.strictEqual(isAppUrl('https://evil.example/', DEV), false)
assert.strictEqual(isAppUrl('not a url', DEV), false)
assert.strictEqual(isAppUrl('', null), false)
// A dev server origin is only trusted while running from it
assert.strictEqual(isAppUrl(`${DEV}/`, null), false)

const ask = (overrides) => ({
  permission: 'media',
  url: PACKAGED,
  mainFrame: true,
  mediaTypes: ['audio'],
  ...overrides
})

// The microphone, from the app's own main frame, is the one media grant
assert.strictEqual(permissionAllowed(ask({}), null), true)
assert.strictEqual(permissionAllowed(ask({ url: `${DEV}/` }), DEV), true)

// Camera, camera-plus-mic, unspecified media and screen capture are refused
assert.strictEqual(permissionAllowed(ask({ mediaTypes: ['video'] }), null), false)
assert.strictEqual(permissionAllowed(ask({ mediaTypes: ['audio', 'video'] }), null), false)
assert.strictEqual(permissionAllowed(ask({ mediaTypes: [] }), null), false)
assert.strictEqual(permissionAllowed(ask({ mediaTypes: ['unknown'] }), null), false)
assert.strictEqual(permissionAllowed(ask({ permission: 'display-capture' }), null), false)

// Foreign pages and sub-frames get nothing, even the microphone
assert.strictEqual(permissionAllowed(ask({ url: 'https://evil.example/' }), null), false)
assert.strictEqual(permissionAllowed(ask({ mainFrame: false }), null), false)

// The code-block copy button keeps working; everything else stays off
assert.strictEqual(
  permissionAllowed(ask({ permission: 'clipboard-sanitized-write', mediaTypes: [] }), null),
  true
)
for (const permission of ['notifications', 'geolocation', 'clipboard-read', 'openExternal']) {
  assert.strictEqual(permissionAllowed(ask({ permission, mediaTypes: [] }), null), false)
}

console.log('permissions tests passed')
