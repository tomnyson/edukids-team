import { app, shell, nativeTheme, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDb, getDb } from './db/connection'
import { abortAllRuns, registerIpcHandlers } from './ipc/register'
import { installPermissionPolicy } from './security/permissions'
import { applyTheme } from './settings/store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    show: false,
    // Painted before the renderer exists, so it follows the resolved theme.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d0f12' : '#f1ede7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // A run keeps streaming while the window sits behind another app.
      backgroundThrottling: false,
      // electron-vite bundles the preload as CJS, which the sandbox cannot load.
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.claudegui.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  try {
    getDb()
  } catch (error) {
    console.error('[main] database failed to open:', error)
  }

  // Before the first paint, so the traffic lights match the chosen theme.
  applyTheme()

  // Before any page loads, so the renderer never runs under Electron's allow-all default
  installPermissionPolicy()
  registerIpcHandlers(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  abortAllRuns()
  closeDb()
})
