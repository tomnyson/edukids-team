import type { BrowserWindow } from 'electron'

export type WindowGetter = () => BrowserWindow | null

/** Pushes an event to the renderer, skipping a window that is gone: a run can outlive it. */
export function push(getWindow: WindowGetter, channel: string, payload: unknown): void {
  const window = getWindow()
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
  window.webContents.send(channel, payload)
}
