const Database = require('better-sqlite3')
const assert = require('assert')

// Both modules only import better-sqlite3's types, so Node's type stripping loads them as is.
const { migrate } = require('../src/main/db/schema.ts')
const {
  replaceMemberSkills,
  skillRefsByMember,
  forgetSkillRef
} = require('../src/main/db/member-skills.ts')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
migrate(db)
assert.strictEqual(db.pragma('user_version', { simple: true }), 9)

const companyId = db.prepare("INSERT INTO companies (name) VALUES ('Acme')").run().lastInsertRowid
const addMember = (name) =>
  Number(
    db
      .prepare(
        `INSERT INTO company_members (company_id, name, role, provider, model_id, system_prompt)
         VALUES (?, ?, 'r', 'opencode', 'm', 'p')`
      )
      .run(companyId, name).lastInsertRowid
  )
const ada = addMember('Ada')
const bob = addMember('Bob')

// Replacing keeps the given order and drops duplicates
replaceMemberSkills(db, ada, ['user:b', 'app:a', 'user:b'])
replaceMemberSkills(db, bob, ['user:b'])
assert.deepStrictEqual(skillRefsByMember(db, [ada, bob]), new Map([
  [ada, ['user:b', 'app:a']],
  [bob, ['user:b']]
]))

// A second replace is a full swap, not a merge
replaceMemberSkills(db, ada, ['app:c'])
assert.deepStrictEqual(skillRefsByMember(db, [ada]).get(ada), ['app:c'])

// Members without skills are simply absent from the map
const cy = addMember('Cy')
assert.strictEqual(skillRefsByMember(db, [cy]).has(cy), false)
assert.strictEqual(skillRefsByMember(db, []).size, 0)

// The same ref twice for one member is refused by the key
assert.throws(() =>
  db.prepare('INSERT INTO member_skills (member_id, skill_ref) VALUES (?, ?)').run(ada, 'app:c')
)

// Deleting a skill from the library detaches it from every member
replaceMemberSkills(db, cy, ['user:b', 'app:c'])
forgetSkillRef(db, 'user:b')
assert.strictEqual(skillRefsByMember(db, [bob]).has(bob), false)
assert.deepStrictEqual(skillRefsByMember(db, [cy]).get(cy), ['app:c'])

// Removing a member takes its skill links with it
db.prepare('DELETE FROM company_members WHERE id = ?').run(ada)
assert.strictEqual(
  db.prepare('SELECT COUNT(*) AS n FROM member_skills WHERE member_id = ?').get(ada).n,
  0
)

// Running migrate again on a current database is a no-op
migrate(db)
assert.strictEqual(db.pragma('user_version', { simple: true }), 9)

console.log('member-skills tests passed')
