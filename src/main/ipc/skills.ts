import { dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { join } from 'path'
import { SKILL_CHANNELS } from '@shared/ipc'
import type { CompanyMember, Result } from '@shared/types'
import type { SkillDetail } from '@shared/skills'
import { setMemberSkills } from '../db/companies'
import { getDb } from '../db/connection'
import { forgetSkillRef } from '../db/member-skills'
import { listSkills, loadSkill, SKILL_FILE } from '../skills/disk'
import { skillRoots } from '../skills/library'
import { checkSkillRefs, skillRef } from '../skills/skill-format'
import { createSkill, importSkillFolder, removeSkillFolder, updateSkill } from '../skills/store'
import { fail, guard, ok } from './result'

const missing = (): Result<never> =>
  fail({ code: 'NOT_FOUND', message: 'That skill is no longer there.' })
const invalid = (message: string): Result<never> => fail({ code: 'INVALID_INPUT', message })

const IMPORT_DIALOG: OpenDialogOptions = {
  title: 'Import a skill',
  message: 'Choose a folder that holds a SKILL.md.',
  buttonLabel: 'Import',
  properties: ['openDirectory']
}

/** The path comes from the native dialog, never from the renderer. */
async function importFromDialog(window: BrowserWindow | null): Promise<Result<SkillDetail>> {
  const picked = window
    ? await dialog.showOpenDialog(window, IMPORT_DIALOG)
    : await dialog.showOpenDialog(IMPORT_DIALOG)
  const [folder] = picked.filePaths
  if (picked.canceled || !folder) return fail({ code: 'CANCELLED', message: 'No folder chosen.' })
  return importSkillFolder(skillRoots().app, folder)
}

/** Only app skills can be deleted; members using it drop it in the same step. */
async function deleteAppSkill(dir: unknown): Promise<Result<true>> {
  const result = await removeSkillFolder(skillRoots().app, dir, (path) => shell.trashItem(path))
  if (result.ok && typeof dir === 'string') forgetSkillRef(getDb(), skillRef('app', dir))
  return result
}

function attachSkills(memberId: unknown, refs: unknown): Result<CompanyMember> {
  if (typeof memberId !== 'number' || !Number.isInteger(memberId) || memberId <= 0) {
    return invalid('Unknown member.')
  }
  const check = checkSkillRefs(refs)
  if (!check.ok) return invalid(check.message)
  const member = setMemberSkills(memberId, check.refs)
  return member ? ok(member) : fail({ code: 'NOT_FOUND', message: 'That member no longer exists.' })
}

export function registerSkillIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    SKILL_CHANNELS.list,
    guard('skills', async () => ok(await listSkills(skillRoots())))
  )

  ipcMain.handle(
    SKILL_CHANNELS.get,
    guard('skills', async (_event, ref: unknown) => {
      const detail = await loadSkill(skillRoots(), ref)
      return detail ? ok(detail) : missing()
    })
  )

  ipcMain.handle(
    SKILL_CHANNELS.create,
    guard('skills', (_event, draft: unknown) => createSkill(skillRoots().app, draft))
  )

  ipcMain.handle(
    SKILL_CHANNELS.update,
    guard('skills', (_event, dir: unknown, draft: unknown) =>
      updateSkill(skillRoots().app, dir, draft)
    )
  )

  ipcMain.handle(
    SKILL_CHANNELS.importFolder,
    guard('skills', () => importFromDialog(getWindow()))
  )

  ipcMain.handle(
    SKILL_CHANNELS.delete,
    guard('skills', (_event, dir: unknown) => deleteAppSkill(dir))
  )

  ipcMain.handle(
    SKILL_CHANNELS.reveal,
    guard('skills', async (_event, ref: unknown) => {
      const detail = await loadSkill(skillRoots(), ref)
      if (!detail) return missing()
      shell.showItemInFolder(join(detail.folder, SKILL_FILE))
      return ok(true)
    })
  )

  ipcMain.handle(
    SKILL_CHANNELS.setMemberSkills,
    guard('skills', (_event, memberId: unknown, refs: unknown) => attachSkills(memberId, refs))
  )
}
