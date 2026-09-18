import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectAgentClis } from './services/agent-cli'
import { cloneGithubRepo } from './services/github'
import { ingestFolder, ingestPaste } from './services/ingest'
import { completeLlm } from './services/llm'
import { probeOllama } from './services/local-model'
import { applyMutation } from './services/mutate'
import { proposeMutations, runCodeReview, runHumanize } from './services/review'
import {
  getPreferences,
  loadSecrets,
  saveSecrets,
  secretsFingerprint,
  setProviderSettings,
  setTheme,
} from './services/secure-store'
import type {
  CodeFile,
  LanguageId,
  ProposedMutation,
  ProviderSettings,
  StoredSecrets,
  WorkspaceSnapshot,
} from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null
let currentWorkspace: WorkspaceSnapshot | null = null

function resolvePreload(): string {
  const candidates = ['preload.cjs', 'preload.js', 'preload.mjs']
  for (const name of candidates) {
    const full = path.join(__dirname, name)
    if (fs.existsSync(full)) return full
  }
  return path.join(__dirname, 'preload.cjs')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'Code Review Assistant',
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
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
  ipcMain.handle('prefs:setTheme', (_e, theme: 'system' | 'light' | 'dark') => {
    setTheme(theme)
    return true
  })

  ipcMain.handle('secrets:status', async () => secretsFingerprint(await loadSecrets()))
  ipcMain.handle('secrets:save', async (_e, secrets: StoredSecrets) => {
    const existing = await loadSecrets()
    await saveSecrets({ ...existing, ...secrets })
    return secretsFingerprint(await loadSecrets())
  })
  ipcMain.handle('secrets:clear', async (_e, key?: keyof StoredSecrets) => {
    const existing = await loadSecrets()
    if (!key) {
      await saveSecrets({})
    } else {
      const next = { ...existing }
      delete next[key]
      await saveSecrets(next)
    }
    return secretsFingerprint(await loadSecrets())
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select a project folder to ingest',
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  ipcMain.handle('dialog:openModelFile', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Select a GGUF model file',
      filters: [{ name: 'GGUF models', extensions: ['gguf'] }],
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  ipcMain.handle('ingest:folder', async (_e, folderPath: string) => {
    const result = await ingestFolder(folderPath)
    currentWorkspace = result.workspace
    return result
  })

  ipcMain.handle('ingest:paste', async (_e, content: string, language: LanguageId, fileName?: string) => {
    const workspace = await ingestPaste(content, language, fileName)
    currentWorkspace = workspace
    return workspace
  })

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
      files: currentWorkspace.files.map((f) => (f.id === fileId ? { ...f, content, size: Buffer.byteLength(content, 'utf8') } : f)),
    }
    return currentWorkspace
  })

  ipcMain.handle('review:run', async (_e, workspace?: WorkspaceSnapshot) => {
    const ws = workspace || currentWorkspace
    if (!ws) throw new Error('No workspace loaded. Ingest code first.')
    return runCodeReview(ws)
  })

  ipcMain.handle('humanize:run', async (_e, file: CodeFile) => runHumanize(file))

  ipcMain.handle('mutate:propose', async (_e, instruction: string, workspace?: WorkspaceSnapshot) => {
    const ws = workspace || currentWorkspace
    if (!ws) throw new Error('No workspace loaded.')
    return proposeMutations(ws, instruction)
  })

  ipcMain.handle('mutate:apply', async (_e, mutation: ProposedMutation, confirmed: boolean, workspace?: WorkspaceSnapshot) => {
    const ws = workspace || currentWorkspace
    if (!ws) throw new Error('No workspace loaded.')
    if (!confirmed) {
      return { ok: false, error: 'Explicit confirmation required.', mutation }
    }
    const result = await applyMutation(ws, mutation, true)
    if (result.ok && currentWorkspace) {
      if (mutation.kind === 'delete') {
        currentWorkspace = {
          ...currentWorkspace,
          files: currentWorkspace.files.filter((f) => f.relativePath !== mutation.path && f.path !== mutation.path),
        }
      } else if (mutation.after !== undefined) {
        const idx = currentWorkspace.files.findIndex((f) => f.relativePath === mutation.path || f.path === mutation.path)
        if (idx >= 0) {
          const files = [...currentWorkspace.files]
          files[idx] = {
            ...files[idx],
            content: mutation.after,
            size: Buffer.byteLength(mutation.after, 'utf8'),
          }
          currentWorkspace = { ...currentWorkspace, files }
        } else if (mutation.kind === 'write') {
          currentWorkspace = {
            ...currentWorkspace,
            files: [
              ...currentWorkspace.files,
              {
                id: mutation.id,
                path: mutation.path,
                relativePath: mutation.path,
                language: 'plaintext',
                content: mutation.after,
                size: Buffer.byteLength(mutation.after, 'utf8'),
              },
            ],
          }
        }
      }
    }
    return result
  })

  ipcMain.handle('llm:complete', async (_e, messages) => completeLlm({ messages }))
  ipcMain.handle('agents:detect', async () => detectAgentClis())
  ipcMain.handle('local:probeOllama', async (_e, baseUrl: string) => probeOllama(baseUrl))

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
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
