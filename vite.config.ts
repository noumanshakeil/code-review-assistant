import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Bundle all JS deps into main.cjs so AppX does not need node_modules at runtime.
              // Emit CommonJS — ESM-from-asar is a known Store/AppX launch failure mode on Windows.
              // Native modules must never be required at boot (keytar removed).
              external: [
                'electron',
                /^node:/,
                'assert',
                'buffer',
                'child_process',
                'crypto',
                'events',
                'fs',
                'fs/promises',
                'http',
                'https',
                'os',
                'path',
                'stream',
                'string_decoder',
                'tty',
                'url',
                'util',
                'zlib',
              ],
              output: {
                format: 'cjs',
                entryFileNames: 'main.cjs',
                exports: 'auto',
              },
            },
          },
        },
        onstart(args) {
          args.startup(['.', '--no-sandbox', '--remote-debugging-port=9229'])
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
