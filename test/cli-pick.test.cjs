const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const { pickBinary } = require('../src/main/providers/cli-pick.ts')

const BROKEN_NVM = '/Users/me/.nvm/versions/node/v25.9.0/bin/codex'
const LOCAL = '/Users/me/.local/bin/codex'
const BREW = '/opt/homebrew/bin/codex'

const acceptOnly =
  (...good) =>
  async (path) =>
    good.includes(path)

async function main() {
  // PATH matches win over the known install spots
  assert.strictEqual(await pickBinary([LOCAL], [BREW, LOCAL], acceptOnly(LOCAL, BREW)), LOCAL)

  // A broken copy first on PATH is skipped for the next working one
  assert.strictEqual(await pickBinary([BROKEN_NVM, LOCAL], [BREW], acceptOnly(LOCAL, BREW)), LOCAL)

  // Falls back to the known install spots when nothing on PATH works
  assert.strictEqual(await pickBinary([BROKEN_NVM], [BREW, LOCAL], acceptOnly(LOCAL)), LOCAL)

  // Nothing works: null, not the broken copy
  assert.strictEqual(await pickBinary([BROKEN_NVM], [BREW], acceptOnly()), null)

  // Each path is checked once, in order, even when listed in both places
  const checked = []
  await pickBinary([BROKEN_NVM, LOCAL], [LOCAL, BROKEN_NVM, BREW], async (path) => {
    checked.push(path)
    return false
  })
  assert.deepStrictEqual(checked, [BROKEN_NVM, LOCAL, BREW])

  // Blank lines from `which -a` output are ignored
  assert.strictEqual(await pickBinary(['', LOCAL, ''], [], acceptOnly(LOCAL)), LOCAL)

  console.log('cli-pick tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
