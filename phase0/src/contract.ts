/**
 * Agent-host message contract (Phase 0 feasibility).
 *
 * This is the typed boundary that separates the Pi SDK child process from its
 * host parent (in production the Electron main process, here the headless
 * driver). ADR-0002 requires that everything crossing this boundary be plain,
 * serializable JSON — no shared class instances.
 *
 * Parent→Host are *commands*; Host→Parent are *events* (`event` carries the raw
 * AgentSessionEvent from the SDK, which is already JSON-shaped for the
 * streaming/tool subsets we forward).
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Messages the child-process host emits back to the parent. */
export type HostToParent =
  | { kind: "ready"; sessionId: string; model?: string }
  | { kind: "event"; event: AgentSessionEvent }
  /** Emitted once the current prompt has fully finished (incl. retries). */
  | { kind: "done" }
  /** Child confirming it has disposed its session and is exiting cleanly. */
  | { kind: "shutdown"; code: number }
  | { kind: "log"; level: "info" | "warn" | "error"; message: string };

/** Commands the parent sends into the child-process host. */
export type ParentToHost =
  | { kind: "prompt"; text: string }
  | { kind: "abort" }
  | { kind: "shutdown" };
