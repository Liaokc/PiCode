/**
 * Read-only session index parser tests (ticket 05).
 *
 * The index derives a history tree from Pi's JSONL session files without ever
 * modifying or copying session data. These tests drive the pure parser with a
 * fixture string and assert the tree/fork/branch shape, plus the scope-dir
 * encoding rule. No SDK, no filesystem writes.
 */
import { describe, expect, it } from "vitest";
import {
  encodeSessionScope,
  parseSessionFile,
  type SessionTreeNode,
} from "./sessionIndex";

/** Build a message entry in session-format v3. */
function msg(id: string, parentId: string | null, role: "user" | "assistant", text: string): string {
  return JSON.stringify({
    type: "message",
    id,
    parentId,
    timestamp: "2026-08-25T00:00:00.000Z",
    message: { role, content: text },
  });
}

function header(id = "sess-fork"): string {
  return JSON.stringify({
    type: "session",
    version: 3,
    id,
    timestamp: "2026-08-25T00:00:00.000Z",
    cwd: "/c",
  });
}

describe("encodeSessionScope", () => {
  it("encodes a working directory into Pi's scope folder name", () => {
    expect(encodeSessionScope("/Users/liaokechen")).toBe("--Users-liaokechen--");
    expect(encodeSessionScope("/Users/liaokechen/PiCode")).toBe("--Users-liaokechen-PiCode--");
  });
});

describe("parseSessionFile (read-only index)", () => {
  it("parses a linear session into a single-branch tree", () => {
    const file = [
      header("s1"),
      msg("m1", null, "user", "hello"),
      msg("m2", "m1", "assistant", "hi there"),
      msg("m3", "m2", "user", "run tests"),
      msg("m4", "m3", "assistant", "running…"),
    ].join("\n");
    const idx = parseSessionFile(file, "/sessions/s1.jsonl");

    expect(idx.header.id).toBe("s1");
    expect(idx.entries.map((e) => e.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(idx.tree).toHaveLength(1); // single root
    expect(idx.leaves).toEqual(["m4"]);
    // Preview is the latest user message.
    expect(idx.preview).toBe("run tests");
  });

  it("reflects a fork: one root with two branches", () => {
    const file = [
      header("sf"),
      msg("m1", null, "user", "start"),
      msg("m2", "m1", "assistant", "ok"),
      // Branch A continues from m2.
      msg("m3", "m2", "user", "branch A"),
      msg("m4", "m3", "assistant", "A done"),
      // Branch B forks from m2 (an alternative path).
      msg("m5", "m2", "user", "branch B"),
      msg("m6", "m5", "assistant", "B done"),
    ].join("\n");
    const idx = parseSessionFile(file);

    // Two leaves => two branches from the shared root.
    expect(idx.leaves.sort()).toEqual(["m4", "m6"]);
    const root = idx.tree[0];
    // m2 has two children (m3 and m5) => the fork point.
    const m2 = findNode(root, "m2")!;
    expect(m2.children.map((c) => c.entry.id).sort()).toEqual(["m3", "m5"]);
  });

  it("handles structural entries (tool result, model change) without crashing", () => {
    const file = [
      header("s3"),
      msg("m1", null, "user", "do it"),
      JSON.stringify({
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "t",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } }],
        },
      }),
      JSON.stringify({ type: "model_change", id: "m3", parentId: "m2", timestamp: "t", provider: "x", modelId: "y" }),
      JSON.stringify({
        type: "message",
        id: "m4",
        parentId: "m3",
        timestamp: "t",
        message: { role: "toolResult", toolCallId: "c1", toolName: "bash", content: "file.txt", isError: false },
      }),
      JSON.stringify({
        type: "message",
        id: "m5",
        parentId: "m4",
        timestamp: "t",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      }),
    ].join("\n");
    const idx = parseSessionFile(file);
    expect(idx.entries).toHaveLength(5);
    expect(idx.leaves).toEqual(["m5"]);
    // Assistant text via content-block extraction.
    expect(idx.entries[4].text).toBe("done");
    // toolResult assistant text is empty (not a user message) but still indexed.
    expect(idx.entries[3].role).toBe("toolResult");
  });

  it("parses a session with a compaction/summary entry in the path", () => {
    const file = [
      header("s4"),
      msg("m1", null, "user", "early"),
      JSON.stringify({
        type: "compaction",
        id: "c1",
        parentId: "m1",
        timestamp: "t",
        summary: "summarized earlier",
        firstKeptEntryId: "m2",
        tokensBefore: 100,
      }),
      msg("m2", "c1", "user", "later"),
      msg("m3", "m2", "assistant", "ok"),
    ].join("\n");
    const idx = parseSessionFile(file);
    expect(idx.leaves).toEqual(["m3"]);
    // Compaction entries are structural, not user messages; preview = latest user.
    expect(idx.preview).toBe("later");
  });

  it("tolerates a malformed trailing line", () => {
    const file = [header("s5"), msg("m1", null, "user", "hi"), "not json"].join("\n");
    const idx = parseSessionFile(file);
    expect(idx.entries.map((e) => e.id)).toEqual(["m1"]);
  });
});

function findNode(node: SessionTreeNode, id: string): SessionTreeNode | undefined {
  if (node.entry.id === id) return node;
  for (const child of node.children) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return undefined;
}
