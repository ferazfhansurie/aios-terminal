import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
        formats: ['es'],
      },
      rollupOptions: {
        external: ['electron', 'better-sqlite3', 'keytar', 'electron-store', '@anthropic-ai/claude-code', 'path', 'os', 'fs', 'crypto', 'child_process', 'chokidar'],
        output: {
          format: 'es',
          entryFileNames: '[name].mjs',
        },
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
        formats: ['cjs'],
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
    },
    plugins: [react()],
  },
})
