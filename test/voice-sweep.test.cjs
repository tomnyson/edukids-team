const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { sweepStale } = require('../src/main/voice/sweep.ts')

const HOUR = 60 * 60 * 1000

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-sweep-test-'))
  try {
    const now = Date.now()
    const age = (target, ms) => fs.utimesSync(target, (now - ms) / 1000, (now - ms) / 1000)

    // A clip folder left by a quit or crash goes; one another window may still use stays
    const oldClip = path.join(root, 'claude-gui-voice-old')
    fs.mkdirSync(oldClip)
    fs.writeFileSync(path.join(oldClip, 'clip.wav'), 'spoken words')
    age(oldClip, 2 * HOUR)
    const freshClip = path.join(root, 'claude-gui-voice-fresh')
    fs.mkdirSync(freshClip)
    // Names that do not match are never touched, however old
    const stranger = path.join(root, 'someone-else')
    fs.mkdirSync(stranger)
    age(stranger, 2 * HOUR)

    const matches = (name) => name.startsWith('claude-gui-voice-')
    assert.strictEqual(await sweepStale(root, matches, HOUR, now), 1)
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['claude-gui-voice-fresh', 'someone-else'])

    // Half-downloaded models are files, not folders
    const models = path.join(root, 'models')
    fs.mkdirSync(models)
    fs.writeFileSync(path.join(models, 'ggml-small.bin.part'), 'half')
    age(path.join(models, 'ggml-small.bin.part'), 2 * HOUR)
    fs.writeFileSync(path.join(models, 'ggml-base.bin'), 'model')
    age(path.join(models, 'ggml-base.bin'), 2 * HOUR)
    assert.strictEqual(await sweepStale(models, (name) => name.endsWith('.part'), HOUR, now), 1)
    assert.deepStrictEqual(fs.readdirSync(models), ['ggml-base.bin'])

    // A folder that does not exist yet is nothing to sweep, not an error
    assert.strictEqual(await sweepStale(path.join(root, 'missing'), matches, HOUR, now), 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
  console.log('voice-sweep tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
