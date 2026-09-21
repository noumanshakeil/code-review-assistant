import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { cloneGithubRepo } from './services/github'
import { ingestFolder, ingestPaste } from './services/ingest'
import { completeLlm, defaultModelFor, listProviderModels } from './services/llm'
import { applyMutation } from './services/mutate'
import {
  proposeMutations,
  runHumanizeForFiles,
  runReviewsForFiles,
} from './services/review'
import {
  getPreferences,
  hasAnyApiKey,
  loadSecrets,
  saveSecrets,
  secretsFingerprint,
  setProviderSettings,
  setSetupComplete,
  setTheme,
} from './services/secure-store'
import type {
  LanguageId,
  ProposedMutation,
  ProviderId,
  ProviderSettings,
  StoredSecrets,
  WorkspaceSnapshot,
} from '../src/shared/types'

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const APP_USER_MODEL_ID = 'PocketMind.PocketMindAIReviewerAndHumanizer'

let mainWindow: BrowserWindow | null = null
let currentWorkspace: WorkspaceSnapshot | null = null

/** Resolve paths from Electron app root (works in asar + Store AppX). */
function appRoot(): string {
  return app.getAppPath()
}

function resolvePreload(): string {
  const root = appRoot()
  const candidates = [
    path.join(root, 'dist-electron', 'preload.cjs'),
    path.join(root, 'dist-electron', 'preload.js'),
    path.join(root, 'dist-electron', 'preload.mjs'),
  ]
  for (const full of candidates) {
    if (fs.existsSync(full)) return full
  }
  return candidates[0]
}

/** Store/AppX Surface devices have crashed on GPU init before any window appears. */
function hardenWindowsLaunch() {
  if (process.platform !== 'win32') return
  try {
    app.setAppUserModelId(APP_USER_MODEL_ID)
  } catch (err) {
    console.error('setAppUserModelId failed', err)
  }
  // Software rendering avoids GPU-driver hard crashes in Store containers.
  // Do NOT also force --disable-gpu / in-process-gpu — that combo can prevent
  // Chromium from painting, so ready-to-show never fires and the window stays hidden.
  try {
    app.disableHardwareAcceleration()
  } catch (err) {
    console.error('disableHardwareAcceleration failed', err)
  }
}

function resolveRendererIndex(): string {
  return path.join(appRoot(), 'dist', 'index.html')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'PocketMind AI: Reviewer And Humanizer',
    backgroundColor: '#0f1419',
    show: false,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  let shown = false
  const reveal = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return
    shown = true
    mainWindow.show()
  }

  mainWindow.once('ready-to-show', reveal)
  // Fallback if compositor never paints (software GPU / Store sandbox).
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(reveal, 250)
  })
  setTimeout(reveal, 2500)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('did-fail-load', code, desc, url)
    reveal()
    dialog.showErrorBox(
      'Failed to load UI',
      `The app window failed to load.\n\n${desc}\nURL: ${url}\nCode: ${code}`,
    )
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const indexHtml = resolveRendererIndex()
    if (!fs.existsSync(indexHtml)) {
      reveal()
      dialog.showErrorBox(
        'Missing UI files',
        `Could not find the app UI at:\n${indexHtml}\n\nPlease reinstall the application.`,
      )
      return
    }
    void mainWindow.loadFile(indexHtml)
  }
}

function registerIpc() {
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
  }))

  ipcMain.handle('prefs:get', () => getPreferences())
  ipcMain.handle('prefs:setProvider', (_e, settings: ProviderSettings) => setProviderSettings(settings))
  ipcMain.handle('prefs:setSetupComplete', (_e, done: boolean) => {
    setSetupComplete(done)
    return true
  })
  ipcMain.handle('prefs:setTheme', (_e, theme: 'system' | 'light' | 'dark') => {
    setTheme(theme)
    return true
  })
  ipcMain.handle('prefs:hasApiKey', async () => hasAnyApiKey())

  ipcMain.handle('secrets:status', async () => secretsFingerprint(await loadSecrets()))
  ipcMain.handle('secrets:save', async (_e, secrets: StoredSecrets) => {
    const existing = await loadSecrets()
    await saveSecrets({ ...existing, ...secrets })
    return secretsFingerprint(await loadSecrets())
  })
  ipcMain.handle('secrets:clear', async (_e, key?: keyof StoredSecrets) => {
    const existing = await loadSecrets()
    if (!key) await saveSecrets({})
    else {
      const next = { ...existing }
      delete next[key]
      await saveSecrets(next)
    }
    return secretsFingerprint(await loadSecrets())
  })

  ipcMain.handle('models:list', async (_e, provider: ProviderId) => listProviderModels(provider))
  ipcMain.handle('models:default', (_e, provider: ProviderId) => defaultModelFor(provider))

  ipcMain.handle('dialog:openFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select a project folder to ingest',
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  ipcMain.handle('ingest:folder', async (_e, folderPath: string) => {
    const result = await ingestFolder(folderPath)
    const rootName = result.workspace.name
    result.workspace.files = result.workspace.files.map((f) => ({
      ...f,
      relativePath: f.relativePath.startsWith(`${rootName}/`)
        ? f.relativePath
        : `${rootName}/${f.relativePath}`,
    }))
    currentWorkspace = result.workspace
    return result
  })

  ipcMain.handle(
    'ingest:paste',
    async (_e, content: string, language: LanguageId, fileName?: string, append?: boolean) => {
      const workspace = await ingestPaste(
        content,
        language,
        fileName,
        append ? currentWorkspace : null,
      )
      currentWorkspace = workspace
      return workspace
    },
  )

  ipcMain.handle('ingest:github', async (_e, url: string, token?: string) => {
    const result = await cloneGithubRepo({ url, token })
    currentWorkspace = result.workspace
    return result
  })

  ipcMain.handle('workspace:get', () => currentWorkspace)
  ipcMain.handle('workspace:set', (_e, workspace: WorkspaceSnapshot | null) => {
    currentWorkspace = workspace
    return true
  })
  ipcMain.handle('workspace:updateFile', (_e, fileId: string, content: string) => {
    if (!currentWorkspace) return null
    currentWorkspace = {
      ...currentWorkspace,
      files: currentWorkspace.files.map((f) =>
        f.id === fileId ? { ...f, content, size: Buffer.byteLength(content, 'utf8') } : f,
      ),
    }
    return currentWorkspace
  })

  ipcMain.handle('review:runSelected', async (_e, fileIds: string[]) => {
    if (!currentWorkspace) throw new Error('No workspace loaded.')
    const files = currentWorkspace.files.filter((f) => fileIds.includes(f.id))
    if (!files.length) throw new Error('Select 1–5 files first.')
    if (files.length > 5) throw new Error('Select at most 5 files.')
    return runReviewsForFiles(files)
  })

  ipcMain.handle('humanize:runSelected', async (_e, fileIds: string[]) => {
    if (!currentWorkspace) throw new Error('No workspace loaded.')
    const files = currentWorkspace.files.filter((f) => fileIds.includes(f.id))
    if (!files.length) throw new Error('Select 1–5 files first.')
    if (files.length > 5) throw new Error('Select at most 5 files.')
    return runHumanizeForFiles(files)
  })

  ipcMain.handle('mutate:propose', async (_e, instruction: string, fileIds?: string[]) => {
    if (!currentWorkspace) throw new Error('No workspace loaded.')
    const files = fileIds?.length
      ? currentWorkspace.files.filter((f) => fileIds.includes(f.id))
      : currentWorkspace.files.slice(0, 5)
    return proposeMutations(currentWorkspace, instruction, files)
  })

  ipcMain.handle(
    'mutate:apply',
    async (_e, mutation: ProposedMutation, confirmed: boolean) => {
      if (!currentWorkspace) throw new Error('No workspace loaded.')
      if (!confirmed) return { ok: false, error: 'Explicit confirmation required.', mutation }
      const result = await applyMutation(currentWorkspace, mutation, true)
      if (result.ok && currentWorkspace) {
        if (mutation.kind === 'delete') {
          currentWorkspace = {
            ...currentWorkspace,
            files: currentWorkspace.files.filter(
              (f) => f.relativePath !== mutation.path && f.path !== mutation.path,
            ),
          }
        } else if (mutation.after !== undefined) {
          const idx = currentWorkspace.files.findIndex(
            (f) => f.relativePath === mutation.path || f.path === mutation.path,
          )
          if (idx >= 0) {
            const files = [...currentWorkspace.files]
            files[idx] = {
              ...files[idx],
              content: mutation.after,
              size: Buffer.byteLength(mutation.after, 'utf8'),
            }
            currentWorkspace = { ...currentWorkspace, files }
          }
        }
      }
      return result
    },
  )

  ipcMain.handle('llm:complete', async (_e, messages) => completeLlm({ messages }))

  ipcMain.handle('confirm:destructive', async (_e, message: string, detail?: string) => {
    const res = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm action',
      message,
      detail,
    })
    return res.response === 1
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    const allowed = /^https?:\/\//i.test(url) || /^mailto:/i.test(url)
    if (!allowed) throw new Error('Only http(s) and mailto links are allowed.')
    await shell.openExternal(url)
    return true
  })
}

function boot() {
  try {
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : String(err)
    console.error('boot failed', message)
    dialog.showErrorBox('PocketMind failed to start', message)
    app.quit()
  }
}

// Prevent silent hard crashes during Store certification
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err)
  try {
    dialog.showErrorBox('Unexpected error', err?.stack || String(err))
  } catch {
    /* ignore */
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason)
})

hardenWindowsLaunch()

app.whenReady().then(boot)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
