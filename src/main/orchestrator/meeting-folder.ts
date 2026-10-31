import { join, resolve } from 'path'

export interface MeetingFolderInput {
  /** The folder picked when the project was added; null for a meeting outside any project. */
  readonly projectPath: string | null
  readonly conversationId: number
  readonly home: string
  /** Where meetings without a project get a folder of their own. */
  readonly workspacesRoot: string
}

/**
 * A meeting writes code into its project's folder, not into the app's own repo. The executor
 * runs shell commands there, so the home folder a conversation defaults to, and the root, never
 * count as a project; such a meeting gets a folder of its own instead.
 */
export function resolveMeetingFolder(input: MeetingFolderInput): string {
  const project = input.projectPath ? resolve(input.projectPath) : null
  const unsafe = [resolve(input.home), resolve('/')]
  if (project && !unsafe.includes(project)) return project
  return join(input.workspacesRoot, String(input.conversationId))
}

/** Every member is told the real path, so nobody invents one when the user asks where the code is. */
export function meetingFolderNote(
  folder: string,
  executorName: string,
  isExecutor: boolean
): string {
  return isExecutor
    ? `Project folder: ${folder}\nYou are this meeting's executor. Write the code into that folder and run it there, then report the files you changed and the commands you actually ran.`
    : `Project folder: ${folder}\nYou have no tools in this meeting. Do not claim to have written files or run commands; only ${executorName} does that.`
}
