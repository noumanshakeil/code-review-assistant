/**
 * Bundle Electron main + preload as CommonJS for Microsoft Store / AppX.
 * ESM-from-asar has caused silent launch crashes on Windows certification devices.
 */
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'dist-electron')

const nodeBuiltins = [
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'string_decoder',
  'timers',
  'tty',
  'url',
  'util',
  'zlib',
]

fs.mkdirSync(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(root, 'electron/main.ts')],
  outfile: path.join(outDir, 'main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
  external: ['electron', ...nodeBuiltins, ...nodeBuiltins.map((b) => `node:${b}`)],
})

await esbuild.build({
  entryPoints: [path.join(root, 'electron/preload.ts')],
  outfile: path.join(outDir, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
  external: ['electron'],
})

// Remove Vite's ESM main.js so AppX never resolves the wrong entry.
const esmMain = path.join(outDir, 'main.js')
if (fs.existsSync(esmMain)) fs.unlinkSync(esmMain)

const mainCjs = fs.readFileSync(path.join(outDir, 'main.cjs'), 'utf8')
if (mainCjs.trimStart().startsWith('import ')) {
  throw new Error('main.cjs is still ESM — Store packaging aborted')
}
if (mainCjs.includes('keytar')) {
  throw new Error('keytar must not appear in the packaged main process')
}

console.log('bundle-electron: wrote dist-electron/main.cjs + preload.cjs')
