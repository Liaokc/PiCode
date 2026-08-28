/**
 * Real-PTY smoke (spec testing seam #3) — the ONLY script in the repository
 * that spawns a real pseudo-terminal (guardrail:
 * tests/terminal/pty-guardrail.test.ts). Verifies node-pty behaves under
 * Electron's node ABI the way the Terminal service uses it:
 *
 *   spawn login shell → prompt echoes marker → resize → prompt again
 *   → exit → clean exit event (code 0)
 *
 * Usage (must run under Electron's node so node-pty's ABI matches):
 *   ELECTRON_RUN_AS_NODE=1 electron scripts/smoke/pty-smoke.mjs  (npm run smoke:pty)
 * Any missed step times out and exits non-zero. Progress logs as
 * `PTY_SMOKE <step>` lines on stdout. Not part of `npm test`.
 */
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'
import pty from 'node-pty'

const STEP_TIMEOUT_MS = 20_000
const TOTAL_BUDGET_MS = 45_000
const SHELL = process.env.SHELL || '/bin/zsh'
const MARKER_ECHO = 'PICODE_PTY_SMOKE_ECHO_OK'
const MARKER_RESIZE = 'PICODE_PTY_SMOKE_AFTER_RESIZE_OK'

const log = (step, detail = '') => console.log(`PTY_SMOKE ${step}${detail ? ` ${detail}` : ''}`)
const fail = (message) => {
  console.error(`PTY_SMOKE FAIL ${message}`)
  process.exit(1)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const cwd = mkdtempSync(path.join(tmpdir(), 'picode-pty-smoke-'))
let buffered = ''

const term = pty.spawn(SHELL, ['--login'], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd,
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
})

term.onData((data) => {
  buffered += data
  if (buffered.length > 64_000) buffered = buffered.slice(-32_000)
})

const exitPromise = new Promise((resolve) => term.onExit(resolve))

async function waitForMarker(marker, label) {
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (buffered.includes(marker)) return
    await sleep(50)
  }
  fail(`${label} timed out; tail: ${JSON.stringify(buffered.slice(-400))}`)
}

async function main() {
  log('spawn', `shell=${SHELL} pid=${term.pid} cwd=${cwd}`)

  // Give the login shell a moment to print its prompt, then run a command.
  await sleep(500)
  term.write(`echo ${MARKER_ECHO}\r`)
  await waitForMarker(MARKER_ECHO, 'echo before resize')
  log('echo_ok')

  // Resize must not wedge the pty; the shell must stay responsive after it.
  term.resize(120, 30)
  await sleep(200)
  term.write(`echo ${MARKER_RESIZE}\r`)
  await waitForMarker(MARKER_RESIZE, 'echo after resize')
  log('resize_ok', 'cols=120 rows=30')

  // Clean exit: the shell terminates with code 0 and the exit event fires.
  term.write('exit\r')
  const exit = await Promise.race([
    exitPromise,
    sleep(STEP_TIMEOUT_MS).then(() => null)
  ])
  if (!exit) fail('exit event never fired')
  if (exit.exitCode !== 0) fail(`expected clean exit code 0, got ${exit.exitCode}`)
  log('exit_ok', `exitCode=${exit.exitCode}`)

  log('done')
  process.exit(0)
}

setTimeout(() => fail(`total budget of ${TOTAL_BUDGET_MS}ms exceeded`), TOTAL_BUDGET_MS).unref()

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
