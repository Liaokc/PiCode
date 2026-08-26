/**
 * Session sidebar (ticket 05).
 *
 * Lists the working-directory scope's sessions as a history tree, derived
 * read-only from Pi's JSONL session files (see sessionIndex). The user can start
 * a fresh session, resume a past one, or fork one into a new branch — without
 * altering the original. The active session is highlighted; the tree stays
 * browseable while a session is in flight.
 */
import { useState } from "react";
import type { IndexedSession, SessionTreeNode } from "../shared/sessionIndex";

interface SidebarProps {
  sessions: IndexedSession[];
  activeSessionId?: string;
  onNew: () => void;
  onResume: (sessionPath: string) => void;
  onFork: (sessionPath: string, entryId: string) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  onNew,
  onResume,
  onFork,
}: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">会话</span>
        <button className="sidebar-new" onClick={onNew} title="新建会话">
          ＋ 新建
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.length === 0 && (
          <div className="sidebar-empty">还没有历史会话。发给 Pi 的第一条消息会生成一个会话。</div>
        )}
        {sessions.map((s) => (
          <SessionItem
            key={s.path}
            session={s}
            active={s.header.id === activeSessionId}
            onResume={onResume}
            onFork={onFork}
          />
        ))}
      </div>
    </aside>
  );
}

function SessionItem({
  session,
  active,
  onResume,
  onFork,
}: {
  session: IndexedSession;
  active: boolean;
  onResume: (sessionPath: string) => void;
  onFork: (sessionPath: string, entryId: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const hasForks = session.tree.length > 1 || session.leaves.length > 1;

  return (
    <div className={`session-item ${active ? "active" : ""}`}>
      <div
        className="session-row"
        onClick={() => onResume(session.path)}
        title="点击重开会话(resume)"
      >
        <span
          className={`session-caret ${expanded ? "open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
        >
          ▸
        </span>
        {active && <span className="session-active-dot" title="当前活跃会话" />}
        <span className="session-preview">{session.preview}</span>
        <span className="session-branch-count">
          {hasForks ? `· ${session.leaves.length} 分支` : ""}
        </span>
        <button
          className="session-fork"
          title="分叉此会话为新分支(fork),不改动原会话"
          onClick={(e) => {
            e.stopPropagation();
            const entryId = lastUserEntry(session);
            if (entryId) onFork(session.path, entryId);
          }}
        >
          分叉
        </button>
      </div>
      {expanded && (
        <div className="session-tree">
          {session.tree.map((node) => (
            <TreeNode
              key={node.entry.id}
              node={node}
              depth={0}
              onFork={(entryId) => onFork(session.path, entryId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  onFork,
}: {
  node: SessionTreeNode;
  depth: number;
  onFork: (entryId: string) => void;
}): JSX.Element {
  const entry = node.entry;
  const isUser = entry.role === "user";
  return (
    <div className="tree-node" style={{ paddingLeft: depth * 14 }}>
      <div className="tree-node-row" title={entry.text ?? entry.id}>
        {isUser ? (
          <button
            className="tree-fork"
            title="从此处分叉新分支"
            onClick={(e) => {
              e.stopPropagation();
              onFork(entry.id);
            }}
          >
            ⑂
          </button>
        ) : (
          <span className="tree-bullet">•</span>
        )}
        <span className="tree-label">
          {isUser
            ? truncate(entry.text ?? "(用户消息)")
            : entry.role === "assistant"
              ? truncate(entry.text ?? "(助手)")
              : entryTypeLabel(entry.type)}
        </span>
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.entry.id} node={child} depth={depth + 1} onFork={onFork} />
      ))}
    </div>
  );
}

function lastUserEntry(session: IndexedSession): string | undefined {
  for (let i = session.entries.length - 1; i >= 0; i--) {
    if (session.entries[i].role === "user") return session.entries[i].id;
  }
  return undefined;
}

function truncate(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function entryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    tool_result: "(工具结果)",
    thinking_level_change: "(思考层级)",
    model_change: "(模型变更)",
    compaction: "(摘要)",
  };
  return map[type] ?? type;
}
