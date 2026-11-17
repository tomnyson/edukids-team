const assert = require('assert')
const http = require('http')

require('./support/resolve-ts.cjs')

const {
  parseSearxngResults,
  searchSearxng,
  searxngSearchUrl
} = require('../src/main/search/backends/searxng.ts')
const { looksLikeChallenge, parseSerpLinks } = require('../src/main/search/backends/serp-parse.ts')
const { gatherSources } = require('../src/main/search/gather.ts')
const { DEFAULT_SETTINGS, normaliseSettings } = require('../src/shared/settings.ts')
const { isSearchMode } = require('../src/shared/search.ts')

// --- SearXNG ---

// The instance URL may carry a path and a trailing slash
assert.strictEqual(
  searxngSearchUrl('http://localhost:8888/', 'electron 39'),
  'http://localhost:8888/search?q=electron+39&format=json'
)
assert.strictEqual(
  searxngSearchUrl('https://host.example/searx', 'a&b'),
  'https://host.example/searx/search?q=a%26b&format=json'
)
assert.throws(() => searxngSearchUrl('ftp://host.example', 'q'), /http/i)
assert.throws(() => searxngSearchUrl('', 'q'), /instance/i)

// Results are rebuilt from what is usable; the rest is dropped
assert.deepStrictEqual(
  parseSearxngResults({
    query: 'x',
    results: [
      { url: 'https://one.example/', title: 'One', content: 'First snippet' },
      { url: 'https://two.example/', title: '', content: null },
      { url: 'javascript:alert(1)', title: 'Bad scheme' },
      { title: 'No url' },
      'junk',
      { url: 'https://one.example/', title: 'Duplicate' }
    ]
  }),
  [
    { title: 'One', url: 'https://one.example/', snippet: 'First snippet' },
    { title: 'https://two.example/', url: 'https://two.example/', snippet: '' }
  ]
)
assert.deepStrictEqual(parseSearxngResults({}), [])
assert.deepStrictEqual(parseSearxngResults(null), [])
assert.deepStrictEqual(parseSearxngResults({ results: 'nope' }), [])

// --- A results page read through the hidden browser ---

const engine = { host: 'duckduckgo.com', redirectParam: 'uddg' }
const page = [
  { href: 'https://duckduckgo.com/about', text: 'About' },
  {
    href: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fone.example%2Fa&rut=abc',
    text: 'One result'
  },
  {
    href: 'https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fone.example%2Fa',
    text: 'one.example/a'
  },
  { href: 'https://two.example/b', text: 'Two result' },
  { href: 'https://duckduckgo.com/y.js?ad_domain=ads.example&u3=x', text: 'Sponsored' },
  { href: 'https://duckduckgo.com/l/?uddg=javascript%3Aalert(1)', text: 'Bad' },
  { href: 'https://duckduckgo.com/l/?uddg=http%3A%2F%2F192.168.1.1%2F', text: 'Local' },
  { href: 'https://three.example/', text: '' }
]
assert.deepStrictEqual(parseSerpLinks(page, engine), [
  { title: 'One result', url: 'https://one.example/a', snippet: '' },
  { title: 'Two result', url: 'https://two.example/b', snippet: '' }
])
assert.deepStrictEqual(parseSerpLinks([], engine), [])

assert.strictEqual(looksLikeChallenge('Please complete the CAPTCHA to continue'), true)
assert.strictEqual(looksLikeChallenge('Our systems have detected unusual traffic'), true)
assert.strictEqual(looksLikeChallenge('Ten results about cats'), false)

// --- Settings and the mode that travels with a prompt ---

assert.deepStrictEqual(DEFAULT_SETTINGS.search, { backend: 'searxng', searxngUrl: '' })
assert.deepStrictEqual(
  normaliseSettings({ search: { backend: 'browser', searxngUrl: ' http://localhost:8888/ ' } })
    .search,
  { backend: 'browser', searxngUrl: 'http://localhost:8888/' }
)
assert.deepStrictEqual(
  normaliseSettings({ search: { backend: 'google', searxngUrl: 'file:///etc' } }).search,
  { backend: 'searxng', searxngUrl: '' }
)
assert.deepStrictEqual(normaliseSettings({ search: 'x' }).search, DEFAULT_SETTINGS.search)

for (const mode of ['off', 'search', 'deep']) assert.strictEqual(isSearchMode(mode), true)
for (const mode of ['', 'DEEP', null, undefined, 1]) assert.strictEqual(isSearchMode(mode), false)

// --- Gathering sources: search each query, read the best pages, number what was read ---

async function gatherTests() {
  const statuses = []
  const hits = {
    q1: [
      { title: 'A', url: 'https://a.example/', snippet: 'sa' },
      { title: 'B', url: 'https://b.example/', snippet: 'sb' }
    ],
    q2: [
      { title: 'A again', url: 'https://a.example/', snippet: 'dup' },
      { title: 'C', url: 'https://c.example/', snippet: 'sc' },
      { title: 'D', url: 'https://d.example/', snippet: 'sd' }
    ]
  }
  const read = []
  const sources = await gatherSources({
    queries: ['q1', 'q2'],
    search: async (query) => hits[query],
    read: async (url) => {
      read.push(url)
      if (url === 'https://b.example/') throw new Error('timeout')
      return { title: `Page ${url}`, text: `Text of ${url}`, links: [] }
    },
    maxPages: 3,
    pageBudget: 1000,
    firstIndex: 1,
    seen: new Set(),
    signal: new AbortController().signal,
    onStatus: (status) => statuses.push(status)
  })

  // Pages alternate between queries, so one query cannot use up every slot
  assert.deepStrictEqual(read, ['https://a.example/', 'https://c.example/', 'https://b.example/'])
  // A page that failed to load still counts through its snippet
  assert.deepStrictEqual(sources, [
    {
      index: 1,
      title: 'Page https://a.example/',
      url: 'https://a.example/',
      text: 'Text of https://a.example/'
    },
    {
      index: 2,
      title: 'Page https://c.example/',
      url: 'https://c.example/',
      text: 'Text of https://c.example/'
    },
    { index: 3, title: 'B', url: 'https://b.example/', text: 'sb' }
  ])
  assert.ok(statuses.some((status) => status.includes('q1')))
  assert.ok(statuses.some((status) => /reading/i.test(status)))

  // A later round skips what an earlier one read and keeps numbering
  const more = await gatherSources({
    queries: ['q2'],
    search: async (query) => hits[query],
    read: async () => ({ title: '', text: '', links: [] }),
    maxPages: 5,
    pageBudget: 1000,
    firstIndex: 4,
    seen: new Set(['https://a.example/', 'https://c.example/']),
    signal: new AbortController().signal,
    onStatus: () => {}
  })
  // An empty page falls back to the hit's own title and snippet
  assert.deepStrictEqual(more, [{ index: 4, title: 'D', url: 'https://d.example/', text: 'sd' }])

  // One failed query does not sink the others; all of them failing is an error
  const partial = await gatherSources({
    queries: ['bad', 'q1'],
    search: async (query) => {
      if (query === 'bad') throw new Error('boom')
      return hits[query]
    },
    read: async () => ({ title: 'T', text: 'X', links: [] }),
    maxPages: 1,
    pageBudget: 1000,
    firstIndex: 1,
    seen: new Set(),
    signal: new AbortController().signal,
    onStatus: () => {}
  })
  assert.strictEqual(partial.length, 1)
  await assert.rejects(
    gatherSources({
      queries: ['bad'],
      search: async () => {
        throw new Error('instance is down')
      },
      read: async () => ({ title: '', text: '', links: [] }),
      maxPages: 1,
      pageBudget: 1000,
      firstIndex: 1,
      seen: new Set(),
      signal: new AbortController().signal,
      onStatus: () => {}
    }),
    /instance is down/
  )

  // A stop ends it at once
  const stopped = new AbortController()
  stopped.abort()
  await assert.rejects(
    gatherSources({
      queries: ['q1'],
      search: async (query) => hits[query],
      read: async () => ({ title: '', text: '', links: [] }),
      maxPages: 1,
      pageBudget: 1000,
      firstIndex: 1,
      seen: new Set(),
      signal: stopped.signal,
      onStatus: () => {}
    })
  )
}

// --- The SearXNG adapter against a local server ---

async function searxngTests() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const query = url.searchParams.get('q')
    if (url.pathname !== '/search' || url.searchParams.get('format') !== 'json') {
      response.writeHead(404).end()
    } else if (query === 'forbidden') {
      response.writeHead(403).end('Forbidden')
    } else if (query === 'broken') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('<html>not json')
    } else if (query === 'down') {
      response.writeHead(502).end()
    } else {
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          query,
          results: [{ url: 'https://hit.example/', title: 'Hit', content: query }]
        })
      )
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const signal = new AbortController().signal

  try {
    assert.deepStrictEqual(await searchSearxng(base, 'cats', signal), [
      { title: 'Hit', url: 'https://hit.example/', snippet: 'cats' }
    ])
    // 403 is how an instance says its JSON output is switched off
    await assert.rejects(searchSearxng(base, 'forbidden', signal), /json/i)
    await assert.rejects(searchSearxng(base, 'broken', signal), /not.*json|unexpected/i)
    await assert.rejects(searchSearxng(base, 'down', signal), /502/)
    await assert.rejects(searchSearxng('http://127.0.0.1:1', 'cats', signal), /reach/i)
  } finally {
    server.close()
  }
}

gatherTests()
  .then(searxngTests)
  .then(() => console.log('search backends tests passed'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
