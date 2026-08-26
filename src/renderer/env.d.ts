/// <reference types="vite/client" />

import type { PiCodeApi } from "../shared/api";

declare global {
  interface Window {
    /** The contextBridge API exposed by the preload script. */
    picode: PiCodeApi;
  }
}

export {};
