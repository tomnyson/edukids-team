import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import type { SkillRoots } from './disk'

/** Claude Code's personal skills (read-only here) and the app's own library. */
export function skillRoots(): SkillRoots {
  return {
    user: join(homedir(), '.claude', 'skills'),
    app: join(app.getPath('userData'), 'skills')
  }
}
