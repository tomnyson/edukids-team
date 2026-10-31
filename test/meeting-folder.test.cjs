const assert = require('assert')

// Node >= 23.6 strips TypeScript types natively, so the pure helper module loads directly.
const {
  resolveMeetingFolder,
  meetingFolderNote
} = require('../src/main/orchestrator/meeting-folder.ts')

const base = { conversationId: 5, home: '/Users/me', workspacesRoot: '/data/workspaces' }

// A meeting in a project works in the folder picked when the project was added
assert.strictEqual(
  resolveMeetingFolder({ ...base, projectPath: '/Applications/work/python-demo' }),
  '/Applications/work/python-demo'
)
assert.strictEqual(
  resolveMeetingFolder({ ...base, projectPath: '/Applications/work/python-demo/' }),
  '/Applications/work/python-demo'
)

// No project: a folder of its own, never the home folder the conversation defaults to
assert.strictEqual(resolveMeetingFolder({ ...base, projectPath: null }), '/data/workspaces/5')

// The executor runs shell commands there, so home and root never count as a project folder
assert.strictEqual(
  resolveMeetingFolder({ ...base, projectPath: '/Users/me' }),
  '/data/workspaces/5'
)
assert.strictEqual(
  resolveMeetingFolder({ ...base, projectPath: '/Users/me/' }),
  '/data/workspaces/5'
)
assert.strictEqual(resolveMeetingFolder({ ...base, projectPath: '/' }), '/data/workspaces/5')

// Every member learns the real path, so nobody has to guess it
const executorNote = meetingFolderNote('/p', 'Bos', true)
assert.ok(executorNote.includes('/p'))
assert.ok(executorNote.includes('executor'))

const memberNote = meetingFolderNote('/p', 'Bos', false)
assert.ok(memberNote.includes('/p'))
assert.ok(memberNote.includes('Bos'))
assert.ok(memberNote.includes('no tools'))

console.log('meeting-folder tests passed')
