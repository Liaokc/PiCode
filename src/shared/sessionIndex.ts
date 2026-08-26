/**
 * Read-only session index (ticket 05).
 *
 * Pi owns its conversation truth source: JSONL files under
 * `~/.pi/agent/sessions/--<encoded-cwd>--/`, stored as a `id`/`parentId` tree per
 * file (CONTEXT.md "Session", session-format.md). This module derives a *display
 * index* from those files for the sidebar and the fork list.
 *
 * Hard constraint: this is strictly read-only. It never opens the files for
 * writing and never copies session data anywhere — it only reads each JSONL
 * line, extracts the header + message entries, and derives the tree shape. Pi
 * is consumed read-only; nothing here reaches for a write handle.
 *
 * The parser is intentionally dependency-free (no Pi SDK import) so it can be
 * driven by a fixture JSONL string in tests and reused in the main process.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The session file header (first JSONL line, `type: "session"`). */
export interface SessionFileHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

/** A message entry within a session file, enough for the sidebar/preview. */
export interface SessionTreeEntry {
  id: string;
  parentId: string | null;
  type: string;
  /** Human role, when the entry is a user/assistant message. */
  role?: string;
  /** First piece of text (user message or assistant text), for the preview. */
  text?: string;
  timestamp: string;
}

/** A node in the derived history tree. */
export interface SessionTreeNode {
  entry: SessionTreeEntry;
  children: SessionTreeNode[];
}

/** One indexed session file, with its derived tree. */
export interface IndexedSession {
  /** Absolute path to the source `.jsonl` file (read-only). */
  path: string;
  header: SessionFileHeader;
  /** All message entries (header excluded), in file order. */
  entries: SessionTreeEntry[];
  /** The session tree: roots are entries with `parentId === null`. */
  tree: SessionTreeNode[];
  /** The leaf (most recent) message path from root → the tip of each branch. */
  leaves: string[];
  /** Derived one-line summary of the session for the sidebar. */
  preview: string;
  created: Date;
  modified: Date;
}

/**
 * Encode a working directory into the scope folder name Pi uses under
 * `~/.pi/agent/sessions/` (same rule as SessionManager.getDefaultSessionDir).
 */
export function encodeSessionScope(cwd: string): string {
  const resolved = cwd.replace(/\\/g, "/");
  return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/** Miner for the first human-readable text of a message entry. */
function extractText(line: Record<string, unknown>): { role?: string; text?: string } {
  if (line.type !== "message" || !line.message || typeof line.message !== "object") {
    return {};
  }
  const msg = line.message as Record<string, unknown>;
  const role = typeof msg.role === "string" ? msg.role : undefined;
  const content = msg.content;
  let text: string | undefined;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
        text = block.text;
        if (text) break;
      }
    }
  }
  return { role, text };
}

function toEntry(line: Record<string, unknown>): SessionTreeEntry | null {
  const id = line.id;
  if (typeof id !== "string") return null;
  const { role, text } = extractText(line);
  return {
    id,
    parentId: typeof line.parentId === "string" ? line.parentId : null,
    type: typeof line.type === "string" ? line.type : "unknown",
    role,
    text,
    timestamp: typeof line.timestamp === "string" ? line.timestamp : "",
  };
}

function buildTree(entries: SessionTreeEntry[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const entry of entries) {
    byId.set(entry.id, { entry, children: [] });
  }
  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    const node = byId.get(entry.id)!;
    if (entry.parentId && byId.has(entry.parentId)) {
      byId.get(entry.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Walk every branch of the tree to collect leaf ids (display "tips"). */
function collectLeaves(tree: SessionTreeNode[], leaves: string[] = []): string[] {
  for (const node of tree) {
    if (node.children.length === 0) leaves.push(node.entry.id);
    else collectLeaves(node.children, leaves);
  }
  return leaves;
}

function parseHeader(line: unknown): SessionFileHeader | null {
  const obj = line as Record<string, unknown>;
  if (!obj || obj.type !== "session" || typeof obj.id !== "string") return null;
  return {
    type: "session",
    version: typeof obj.version === "number" ? obj.version : undefined,
    id: obj.id,
    timestamp: typeof obj.timestamp === "string" ? obj.timestamp : "",
    cwd: typeof obj.cwd === "string" ? obj.cwd : "",
    parentSession: typeof obj.parentSession === "string" ? obj.parentSession : undefined,
  };
}

/** Build a derived preview: latest user/assistant text, truncated. */
function derivePreview(entries: SessionTreeEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.role === "user" && e.text && e.text.trim()) {
      const t = e.text.trim();
      return t.length > 72 ? `${t.slice(0, 72)}…` : t;
    }
  }
  return "(空会话)";
}

/**
 * Parse a single session file's text into a full IndexedSession. Pure with
 * respect to the file content; safe to drive with a fixture string in tests.
 */
export function parseSessionFile(fileText: string, filePath = ""): IndexedSession {
  const entries: SessionTreeEntry[] = [];
  let header: SessionFileHeader | null = null;
  for (const rawLine of fileText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // tolerate a malformed trailing line; never fatal
    }
    if (typeof obj !== "object" || obj === null) continue;
    const record = obj as Record<string, unknown>;
    if (!header) {
      header = parseHeader(record);
      if (header) continue;
    }
    const entry = toEntry(record);
    if (entry) entries.push(entry);
  }
  const tree = buildTree(entries);
  const leaves = collectLeaves(tree);
  return {
    path: filePath,
    header:
      header ??
      ({ type: "session", id: filePath, timestamp: "", cwd: "" } as SessionFileHeader),
    entries,
    tree,
    leaves,
    preview: derivePreview(entries),
    created: new Date(),
    modified: new Date(),
  };
}

/**
 * Index every session file under the working-directory scope. Read-only: only
 * `readdir`/`stat`/`readFile` are used; files are never opened for writing.
 * Returns the newest-first list, so the sidebar can show most-recent at top.
 */
export function indexSessionScope(cwd: string, agentDir = "~/.pi/agent"): IndexedSession[] {
  const resolvedAgentDir = agentDir.replace(/^~(?=\/)/, process.env.HOME ?? "");
  const dir = join(resolvedAgentDir, "sessions", encodeSessionScope(cwd));
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return []; // no scope dir yet — nothing to index
  }
  const indexed: IndexedSession[] = [];
  for (const file of files) {
    const path = join(dir, file);
    try {
      const text = readFileSync(path, "utf8");
      const st = statSync(path);
      const parsed = parseSessionFile(text, path);
      indexed.push({ ...parsed, created: st.birthtime, modified: st.mtime });
    } catch {
      // Skip unreadable/session files mid-write; never crash the sidebar for a
      // single broken file.
    }
  }
  indexed.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return indexed;
}
