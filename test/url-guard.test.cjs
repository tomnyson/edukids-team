const assert = require('assert')

require('./support/resolve-ts.cjs')

const { checkUrl, isPublicAddress } = require('../src/main/search/url-guard.ts')
const { decideRequest } = require('../src/main/search/request-policy.ts')

const allowed = (url) => checkUrl(url).ok
const hostOf = (url) => {
  const checked = checkUrl(url)
  return checked.ok ? checked.url.hostname : null
}

// Ordinary public pages pass
assert.strictEqual(allowed('https://example.com/a?b=1'), true)
assert.strictEqual(allowed('http://example.com:8080/'), true)
assert.strictEqual(allowed('https://93.184.216.34/'), true)
assert.strictEqual(hostOf('https://Example.COM/x'), 'example.com')

// Only the web's two schemes
for (const url of [
  'file:///etc/passwd',
  'ftp://example.com/',
  'javascript:alert(1)',
  'data:text/html,x',
  'chrome://settings',
  'about:blank'
]) {
  assert.strictEqual(allowed(url), false, url)
}

// Not a URL at all
for (const value of ['', 'example.com', 'http://', null, undefined, 42]) {
  assert.strictEqual(allowed(value), false, String(value))
}

// Credentials in the URL are refused: they hide the real host from a reader
assert.strictEqual(allowed('https://example.com@127.0.0.1/'), false)
assert.strictEqual(allowed('https://user:pw@example.com/'), false)

// Loopback, private, link-local and metadata addresses, in every spelling the URL parser accepts
for (const url of [
  'http://127.0.0.1/',
  'http://127.1/',
  'http://2130706433/',
  'http://0x7f000001/',
  'http://0177.0.0.1/',
  'http://0.0.0.0/',
  'http://10.0.0.5/',
  'http://172.16.0.1/',
  'http://172.31.255.255/',
  'http://192.168.1.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://100.64.0.1/',
  'http://[::1]/',
  'http://[::]/',
  'http://[fe80::1]/',
  'http://[fc00::1]/',
  'http://[fd12:3456::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:c0a8:0101]/',
  'http://[64:ff9b::7f00:1]/'
]) {
  assert.strictEqual(allowed(url), false, url)
}

// Names that only ever mean this machine or this network
for (const url of [
  'http://localhost/',
  'http://LOCALHOST:3000/',
  'http://app.localhost/',
  'http://printer.local/',
  'http://db.internal/',
  'http://localhost./'
]) {
  assert.strictEqual(allowed(url), false, url)
}

// 172.x outside the private block is public
assert.strictEqual(allowed('http://172.15.0.1/'), true)
assert.strictEqual(allowed('http://172.32.0.1/'), true)

// Resolved addresses are judged the same way
assert.strictEqual(isPublicAddress('93.184.216.34'), true)
assert.strictEqual(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946'), true)
for (const address of [
  '127.0.0.1',
  '10.1.2.3',
  '192.168.0.1',
  '169.254.1.1',
  '::1',
  'fe80::1',
  'fd00::1',
  '::ffff:10.0.0.1',
  '224.0.0.1',
  '255.255.255.255',
  'not-an-ip',
  ''
]) {
  assert.strictEqual(isPublicAddress(address), false, address)
}

// One browser request: what a page needs for its text passes, the rest is cancelled
const decide = (url, resourceType) => decideRequest({ url, resourceType })
assert.strictEqual(decide('https://example.com/', 'mainFrame'), 'allow')
assert.strictEqual(decide('https://cdn.example.com/app.js', 'script'), 'allow')
assert.strictEqual(decide('https://example.com/api', 'xhr'), 'allow')
assert.strictEqual(decide('https://example.com/style.css', 'stylesheet'), 'allow')
for (const type of ['image', 'media', 'font', 'object', 'webSocket', 'ping', 'cspReport']) {
  assert.strictEqual(decide('https://example.com/x', type), 'cancel', type)
}
// A page reaching for the local network is stopped whatever the resource type
assert.strictEqual(decide('http://192.168.1.1/admin', 'xhr'), 'cancel')
assert.strictEqual(decide('http://localhost:11434/api/tags', 'script'), 'cancel')
assert.strictEqual(decide('http://169.254.169.254/', 'mainFrame'), 'cancel')
assert.strictEqual(decide('file:///etc/passwd', 'subFrame'), 'cancel')
assert.strictEqual(decide('not a url', 'mainFrame'), 'cancel')

console.log('url guard tests passed')
