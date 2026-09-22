/**
 * Ticket 134: the main-process reader of the bundled-SDK / pi-subagents
 * version facts (ADR-0003 intact — plain package.json reads, the SDK never
 * loads in main). The pure decision lives in
 * src/shared/subagent-sdk-alignment.ts; index.ts broadcasts the notice as
 * a host_notice toast once the main window can show it.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { subagentsSdkAlignmentNotice } from '../shared/subagent-sdk-alignment'

export interface SdkAlignmentFacts {
  /** The app's bundled @earendil-works/pi-coding-agent version (null = the
   * package tree could not be read — the honest "unknown"). */
  sdkVersion: string | null
  /** The operator's ~/.pi/agent npm pi-subagents version (null = absent). */
  subagentsVersion: string | null
}

function readPackageVersion(file: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { version?: unknown }).version === 'string') {
      return (parsed as { version: string }).version
    }
  } catch {
    // unreadable/absent/malformed — the caller renders the honest degrade
  }
  return null
}

/** The version facts, read from the app's own SDK tree and the operator's
 * agent dir. Exported for the smoke leg's positive assertions too. */
export function readSdkAlignmentFacts(sdkPackageDir?: string): SdkAlignmentFacts {
  // Dev layout: <root>/out/main → <root>/node_modules/…; packaged layout:
  // PiCode.app/Contents/Resources/app/out/main → …/app/node_modules/…
  const sdkDir = sdkPackageDir ?? path.resolve(__dirname, '../../node_modules/@earendil-works/pi-coding-agent')
  const subagentsDir = path.join(homedir(), '.pi', 'agent', 'npm', 'node_modules', 'pi-subagents')
  return {
    sdkVersion: readPackageVersion(path.join(sdkDir, 'package.json')),
    subagentsVersion: readPackageVersion(path.join(subagentsDir, 'package.json'))
  }
}

/** The SDK version this app's package.json pins (null = unreadable). */
export function readPinnedSdkVersion(): string | null {
  const rootPackage = path.resolve(__dirname, '../../package.json')
  try {
    const parsed: unknown = JSON.parse(readFileSync(rootPackage, 'utf8'))
    const dependencies =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as { dependencies?: unknown }).dependencies === 'object'
        ? ((parsed as { dependencies: Record<string, unknown> }).dependencies as Record<string, unknown>)
        : {}
    const pinned = dependencies['@earendil-works/pi-coding-agent']
    return typeof pinned === 'string' && pinned !== '' ? pinned : null
  } catch {
    return null
  }
}

/** The startup notice for the current installation (null = healthy). */
export function subagentSdkAlignmentNoticeForInstallation(): string | null {
  const facts = readSdkAlignmentFacts()
  return subagentsSdkAlignmentNotice(facts.sdkVersion, facts.subagentsVersion)
}
