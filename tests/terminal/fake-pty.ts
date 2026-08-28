/**
 * Test fixtures for Seam-3 (spec: PTY abstraction seam). FakePty replays byte
 * streams so projection/resize/exit paths are verified without a real
 * pseudo-terminal; a REAL pty is only ever spawned by the dedicated smoke
 * script (scripts/smoke/pty-smoke.mjs).
 */
import type { PtyExitEvent, PtyFactory, PtyHandle, PtySpawnOptions } from '../../src/shared/terminal/pty'

export class FakePty implements PtyHandle {
  pid: number | null = 4242
  /** Options this instance was spawned with (recorded by fakePtyFactory). */
  spawnOptions: PtySpawnOptions | null = null
  written: string[] = []
  lastResize: { cols: number; rows: number } | null = null
  killed = false
  resizeCount = 0

  private dataListeners = new Set<(data: string) => void>()
  private exitListeners = new Set<(event: PtyExitEvent) => void>()

  write(data: string): void {
    this.written.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resizeCount += 1
    this.lastResize = { cols, rows }
  }

  kill(): void {
    this.killed = true
  }

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener)
    return () => {
      this.dataListeners.delete(listener)
    }
  }

  onExit(listener: (event: PtyExitEvent) => void): () => void {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  /** Test driver: replay output bytes as if the shell had printed them. */
  emit(data: string): void {
    for (const listener of [...this.dataListeners]) listener(data)
  }

  /** Test driver: simulate process termination. */
  emitExit(event: PtyExitEvent): void {
    for (const listener of [...this.exitListeners]) listener(event)
  }

  get text(): string {
    return this.written.join('')
  }
}

/** Factory that records every spawned instance for assertions. */
export function fakePtyFactory(): { factory: PtyFactory; instances: FakePty[] } {
  const instances: FakePty[] = []
  return {
    instances,
    factory: (options) => {
      const pty = new FakePty()
      pty.spawnOptions = options
      instances.push(pty)
      return pty
    }
  }
}

/** Byte sink standing in for a terminal view (xterm in the renderer). */
export class StringView {
  written: string[] = []

  write(data: string): void {
    this.written.push(data)
  }

  get text(): string {
    return this.written.join('')
  }
}
