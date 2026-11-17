import type Database from 'better-sqlite3'

/**
 * Which skills each company member has. Takes the database as a parameter so tests can run it
 * against an in-memory one; callers in the app pass `getDb()`.
 *
 * Rows are re-inserted on every change, so rowid order is the order the user chose.
 */

/** Swaps a member's whole skill list for `refs`, in one transaction. */
export function replaceMemberSkills(
  db: Database.Database,
  memberId: number,
  refs: readonly string[]
): void {
  const clear = db.prepare('DELETE FROM member_skills WHERE member_id = ?')
  const insert = db.prepare(
    'INSERT OR IGNORE INTO member_skills (member_id, skill_ref) VALUES (?, ?)'
  )
  db.transaction(() => {
    clear.run(memberId)
    for (const ref of refs) insert.run(memberId, ref)
  })()
}

/** Skill refs for each member that has any; members without skills are not in the map. */
export function skillRefsByMember(
  db: Database.Database,
  memberIds: readonly number[]
): ReadonlyMap<number, readonly string[]> {
  if (memberIds.length === 0) return new Map()
  const marks = memberIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT member_id, skill_ref FROM member_skills WHERE member_id IN (${marks}) ORDER BY rowid`
    )
    .all(...memberIds) as { member_id: number; skill_ref: string }[]

  return rows.reduce((map, row) => {
    const current = map.get(row.member_id) ?? []
    return new Map(map).set(row.member_id, [...current, row.skill_ref])
  }, new Map<number, readonly string[]>())
}

/** Detaches a skill from every member, once it is gone from the library. */
export function forgetSkillRef(db: Database.Database, ref: string): void {
  db.prepare('DELETE FROM member_skills WHERE skill_ref = ?').run(ref)
}
