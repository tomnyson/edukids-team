const Database = require('better-sqlite3')
const assert = require('assert')

// Create in-memory database
const db = new Database(':memory:')

db.exec(`
  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    cwd TEXT NOT NULL,
    session_started INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE providers_config (
    id TEXT PRIMARY KEY,
    api_key TEXT,
    base_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    avatar_icon TEXT DEFAULT 'briefcase',
    default_mode TEXT NOT NULL CHECK(default_mode IN ('roundtable', 'pipeline', 'single')),
    fun_mode INTEGER NOT NULL DEFAULT 0,
    moderator_member_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE company_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    order_index INTEGER NOT NULL DEFAULT 0,
    avatar_color TEXT DEFAULT '#00F0FF',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE company_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'member', 'moderator', 'system')),
    member_id INTEGER REFERENCES company_members(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    reasoning_content TEXT,
    step_index INTEGER DEFAULT 0,
    phase TEXT,
    duration_ms INTEGER,
    tokens_used INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Test Company insertion
const insertCompany = db.prepare(`
  INSERT INTO companies (name, description, default_mode, fun_mode)
  VALUES (?, ?, ?, ?)
`)
const res = insertCompany.run('Tech Startup Board', 'Executive AI Advisory', 'roundtable', 1)
assert.strictEqual(res.lastInsertRowid, 1)

// Test Member insertion
const insertMember = db.prepare(`
  INSERT INTO company_members (company_id, name, role, provider, model_id, system_prompt)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const mRes = insertMember.run(1, 'Grok 3', 'Lead Architect', 'xai', 'grok-3', 'You are the Lead Architect.')
assert.strictEqual(mRes.lastInsertRowid, 1)

// Query back
const company = db.prepare('SELECT * FROM companies WHERE id = 1').get()
assert.strictEqual(company.name, 'Tech Startup Board')
assert.strictEqual(company.fun_mode, 1)

const members = db.prepare('SELECT * FROM company_members WHERE company_id = 1').all()
assert.strictEqual(members.length, 1)
assert.strictEqual(members[0].role, 'Lead Architect')

console.log('PASS  Database schema test passed successfully')
