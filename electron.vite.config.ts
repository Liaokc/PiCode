import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Agent host entry (ADR-0003): forked as its own process per session.
          host: resolve(__dirname, 'src/host/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    build: {
      // Ticket-30 perf harness: keep function names intact so `.cpuprofile`
      // flamegraphs attribute script time to real functions (markdown parse
      // vs React commit) instead of minified mangles. Undefined keeps the
      // electron-vite default for every other build.
      minify: process.env['PICODE_PERF'] === '1' ? false : undefined
    }
  }
})
