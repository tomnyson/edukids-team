const assert = require('assert')
const { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

// A Stop that lands while the run is still resolving the CLI must not spawn it: the abort
// listener only exists once the child does, so an earlier abort would otherwise be missed.

const dir = mkdtempSync(join(tmpdir(), 'claude-runner-test-'))
const marker = join(dir, 'spawned')
const binary = join(dir, 'fake-claude')
writeFileSync(binary, `#!/bin/sh\ntouch "${marker}"\n`)
chmodSync(binary, 0o755)

process.env.CLAUDE_CLI_PATH = binary
// The login-shell PATH probe is not under test; a shell that prints nothing keeps it instant
process.env.SHELL = '/usr/bin/true'

require('./support/resolve-ts.cjs')
const { runClaude } = require('../src/main/claude/runner.ts')

const options = (signal) => ({
  prompt: 'hello',
  sessionId: '00000000-0000-4000-8000-000000000000',
  resume: false,
  cwd: dir,
  model: null,
  effort: null,
  addDirs: [],
  signal,
  onDelta: () => {},
  onTool: () => {}
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const stopped = new AbortController()
  stopped.abort()
  const cancelled = await runClaude(options(stopped.signal))
  assert.strictEqual(cancelled.error?.code, 'CANCELLED', 'an aborted run reports Stopped')
  assert.strictEqual(cancelled.text, '')
  // No process means no session, so the conversation must not resume one
  assert.strictEqual(cancelled.spawned, false, 'an aborted run says the CLI never started')
  await sleep(300)
  assert.strictEqual(existsSync(marker), false, 'an aborted run never starts the CLI')

  // The same call with a live signal does start it, so the check above is not vacuous
  const ran = await runClaude(options(new AbortController().signal))
  assert.strictEqual(existsSync(marker), true, 'a live run starts the CLI')
  assert.strictEqual(ran.error?.code, 'CLI_ERROR', 'no result line reads as a CLI error')
  assert.strictEqual(ran.spawned, true, 'a run that started says so, even when it failed')

  rmSync(dir, { recursive: true, force: true })
  console.log('claude runner tests passed')
}

main().catch((error) => {
  rmSync(dir, { recursive: true, force: true })
  console.error(error)
  process.exit(1)
})
