const assert = require('assert')
const { mkdtempSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

// Node >= 23.6 strips TypeScript types natively, so the pure catalog module loads directly.
const {
  parseCatalog,
  rankByCatalog,
  getCatalogModels
} = require('../src/main/providers/model-catalog.ts')

const rawCatalog = {
  anthropic: {
    models: {
      'claude-3-7-sonnet-20250219': {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        reasoning: true,
        release_date: '2025-02-19',
        modalities: { output: ['text'] }
      },
      'claude-opus-5-5': {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        reasoning: true,
        release_date: '2026-09-22',
        modalities: { output: ['text'] }
      },
      'claude-haiku-5-5': {
        id: 'claude-haiku-5-5',
        name: 'Claude Haiku 5.5',
        reasoning: true,
        release_date: '2026-10-07',
        modalities: { output: ['text'] }
      }
    }
  },
  google: {
    models: {
      'gemini-3.8-flash': {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        reasoning: true,
        release_date: '2026-09-02',
        modalities: { output: ['text'] }
      }
    }
  },
  xai: {
    models: {
      'grok-imagine-video-1.5-lite': {
        id: 'grok-imagine-video-1.5-lite',
        name: 'Grok Imagine Video 1.5 Lite',
        release_date: '2026-10-01',
        modalities: { output: ['video'] }
      },
      'grok-4.7': {
        id: 'grok-4.7',
        name: 'Grok 4.7',
        reasoning: true,
        release_date: '2026-09-21',
        modalities: { output: ['text'] }
      }
    }
  },
  deepseek: {
    models: {
      'deepseek-v4-flash': {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        status: 'deprecated',
        release_date: '2026-10-17',
        modalities: { output: ['text'] }
      },
      'deepseek-v4-pro': {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        reasoning: true,
        release_date: '2026-08-13',
        modalities: { output: ['text'] }
      }
    }
  }
}

// Test 1: newest first, provider key mapping, text-only, no deprecated
const parsed = parseCatalog(rawCatalog)
assert.deepStrictEqual(
  parsed.anthropic.map((m) => m.id),
  ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-3-7-sonnet-20250219']
)
assert.strictEqual(parsed.anthropic[0].provider, 'anthropic')
assert.strictEqual(parsed.anthropic[0].reasoning, true)
assert.strictEqual(parsed.gemini[0].id, 'gemini-3.8-flash')
assert.strictEqual(parsed.gemini[0].provider, 'gemini')
assert.deepStrictEqual(
  parsed.xai.map((m) => m.id),
  ['grok-4.7']
)
assert.deepStrictEqual(
  parsed.deepseek.map((m) => m.id),
  ['deepseek-v4-pro']
)
assert.deepStrictEqual(parsed.openai, [])

// Test 2: malformed input never throws
assert.deepStrictEqual(parseCatalog(null).anthropic, [])
assert.deepStrictEqual(parseCatalog({ anthropic: { models: 'nope' } }).anthropic, [])

// Test 3: live API list is reordered newest-first and enriched from the catalog
const live = [
  { id: 'claude-3-7-sonnet-20250219', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic' },
  { id: 'claude-private-preview', name: 'claude-private-preview', provider: 'anthropic' },
  { id: 'claude-opus-5-5', name: 'claude-opus-5-5', provider: 'anthropic' }
]
const ranked = rankByCatalog(live, parsed.anthropic)
assert.deepStrictEqual(
  ranked.map((m) => m.id),
  ['claude-opus-5-5', 'claude-3-7-sonnet-20250219', 'claude-private-preview']
)
assert.strictEqual(ranked[0].name, 'Claude Opus 5.5')
assert.strictEqual(ranked[0].reasoning, true)
assert.strictEqual(live[0].name, 'claude-3-7-sonnet-20250219', 'input must not be mutated')

// Test 4: fresh disk snapshot is served without touching the network
async function cacheTests() {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'))
  try {
    writeFileSync(
      join(dir, 'models-catalog.json'),
      JSON.stringify({ fetchedAt: Date.now(), models: parsed })
    )
    const originalFetch = global.fetch
    let fetchCalls = 0
    global.fetch = async () => {
      fetchCalls += 1
      throw new Error('offline')
    }
    try {
      const fromDisk = await getCatalogModels('anthropic', dir)
      assert.strictEqual(fromDisk[0].id, 'claude-haiku-5-5')
      assert.strictEqual(fetchCalls, 0)

      // Forced refresh while offline falls back to the stale snapshot
      const offline = await getCatalogModels('anthropic', dir, true)
      assert.strictEqual(offline[0].id, 'claude-haiku-5-5')
      assert.strictEqual(fetchCalls, 1)
    } finally {
      global.fetch = originalFetch
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

cacheTests()
  .then(() => console.log('PASS  models.dev catalog parse, rank, and cache unit tests passed'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
