import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * electron-vite config: builds the Electron main process, the preload script
 * and the React renderer separately. The child-process host (src/child/host.ts)
 * is deliberately NOT part of this build graph — it is forked as a plain
 * system-Node process, exactly like the phase0 driver (ADR-0002), and imports
 * the (symlinked, read-only) Pi SDK itself.
 */
export default defineConfig({
  main: {
    resolve: {
      alias: { "@shared": resolve(__dirname, "src/shared") },
    },
  },
  preload: {
    resolve: {
      alias: { "@shared": resolve(__dirname, "src/shared") },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { "@shared": resolve(__dirname, "src/shared") },
    },
  },
});
