/**
 * Ticket 134: the bundled-version acceptance — the dev node_modules must
 * carry SDK/pi-ai 0.86.1 (the floor pi-subagents 0.70.1's review chain
 * needs) AND actually provide the capability face that floor stands for:
 * the SDK's `createReadOnlyTools` / `convertToLlm` exports and pi-ai's
 * transcript utilities (`createInitialSystemMessage` / `toToolDeclaration`,
 * absent before 0.86.0 — the second root factor of the batch's empty runs).
 * Version numbers alone can lie; the probes cannot.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareVersions } from '../../src/shared/subagent-sdk-alignment'

const rootPackage = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}
const pinned = rootPackage.dependencies['@earendil-works/pi-coding-agent'] ?? null
const sdkDir = join(__dirname, '../../node_modules/@earendil-works/pi-coding-agent')
const sdkPackage = JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')) as { version: string }
const piAiDir = join(sdkDir, 'node_modules/@earendil-works/pi-ai')
const piAiPackage = existsSync(join(piAiDir, 'package.json'))
  ? (JSON.parse(readFileSync(join(piAiDir, 'package.json'), 'utf8')) as { version: string })
  : null

describe('the bundled SDK tree (ticket 134 acceptance)', () => {
  it('package.json pins the SDK exactly at 0.86.1 (no drift range)', () => {
    expect(pinned).toBe('0.86.1')
  })

  it('the installed SDK is the pinned version', () => {
    expect(sdkPackage.version).toBe(pinned)
  })

  it('the SDK\u2019s nested pi-ai is at least 0.86.1 (the transcript-tools floor)', () => {
    expect(piAiPackage).not.toBeNull()
    expect(compareVersions(piAiPackage!.version, '0.86.1')).toBeGreaterThanOrEqual(0)
  })

  it('the SDK exports the read-only tool face pi-subagents\u2019 review chain imports', async () => {
    const sdk = (await import('@earendil-works/pi-coding-agent')) as unknown as Record<string, unknown>
    expect(typeof sdk['createReadOnlyTools']).toBe('function')
    expect(typeof sdk['convertToLlm']).toBe('function')
  })

  it('pi-ai provides the transcript utilities (absent before 0.86.0 — the empty-run breakpoint)', async () => {
    const transcriptUrl = pathToFileURL(join(piAiDir, 'dist', 'utils', 'transcript.js')).href
    const transcript = (await import(transcriptUrl)) as unknown as Record<string, unknown>
    expect(typeof transcript['createInitialSystemMessage']).toBe('function')
    expect(typeof transcript['toToolDeclaration']).toBe('function')
  })
})
