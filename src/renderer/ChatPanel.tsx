import type {
  ChatState,
  FileChange,
  PendingApproval,
  QueueState,
  ToolExecution,
  ToolStatus,
} from "../shared/chatReduce";
import type { ApprovalChoice, TrustInfo } from "../shared/api";
import type { IndexedSession } from "../shared/sessionIndex";
import { Sidebar } from "./Sidebar";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface ChatPanelProps {
  state: ChatState;
  sessions: IndexedSession[];
  /** Read-only Pi trust posture for the settings panel (ticket 06). */
  trustInfo: TrustInfo | null;
  /** Submit text; when streaming, `behavior` picks inject/queue (ticket 08). */
  onSubmit: (text: string, behavior?: "steer" | "followUp") => void;
  onAbort: () => void;
  /** Resolve a suspended tool approval with the user's allow/deny choice. */
  onApprovalDecision: (requestId: string, toolName: string, choice: ApprovalChoice) => void;
  onNewSession: () => void;
  onResumeSession: (sessionPath: string) => void;
  onForkSession: (sessionPath: string, entryId: string) => void;
  /** Switch the active session's model (provider/modelId) — ticket 06. */
  onSetModel: (modelRef: string) => void;
  /** Switch the active session's thinking level — ticket 06. */
  onSetThinking: (level: string) => void;
  /** Clear Pi's pending inject/queue messages (ticket 08, queue panel). */
  onClearQueue: () => void;
}

const STATUS_LABEL: Record<ChatState["status"], string> = {
  idle: "未连接",
  starting: "启动中",
  ready: "就绪",
  streaming: "生成中…",
  done: "完成",
  aborted: "已中止",
  error: "错误",
  shutdown: "已停止",
};

export function ChatPanel({
  state,
  sessions,
  trustInfo,
  onSubmit,
  onAbort,
  onApprovalDecision,
  onNewSession,
  onResumeSession,
  onForkSession,
  onSetModel,
  onSetThinking,
  onClearQueue,
}: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // How to send while streaming: undefined = normal send (idle), "steer" = inject
  // mid-turn, "followUp" = queue until the agent stops (ticket 08).
  const [behavior, setBehavior] = useState<"steer" | "followUp" | undefined>(undefined);

  const streaming = state.status === "streaming";

  const handleSubmit = (): void => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text, behavior);
    setDraft("");
  };

  return (
    <div className="app">
      <header className="app-bar">
        <div className="app-title">PiCode</div>
        <div className="app-meta">
          <span className="meta-cwd" title={state.cwd}>
            {state.cwd}
          </span>
          {state.model && <span className="meta-model">{state.model}</span>}
          {state.thinking && <span className="meta-thinking">思考:{state.thinking}</span>}
          {state.sessionId && <span className="meta-session">{state.sessionId}</span>}
          <span className={`status status-${state.status}`}>
            {STATUS_LABEL[state.status]}
          </span>
        </div>
        <button
          className="settings-toggle"
          title="设置"
          onClick={() => setSettingsOpen((o) => !o)}
        >
          ⚙
        </button>
      </header>

      <div className="app-body">
        <Sidebar
          sessions={sessions}
          activeSessionId={state.sessionId}
          onNew={onNewSession}
          onResume={onResumeSession}
          onFork={onForkSession}
        />

        <main className="chat-main">
          <div className="messages">
            {state.entries.map((entry) => (
              <Message key={entry.id} entry={entry} />
            ))}
            {state.tools.map((tool) => (
              <ToolCard key={tool.toolCallId} tool={tool} onAbort={onAbort} />
            ))}
            {state.fileChanges.length > 0 && (
              <FileChangeList files={state.fileChanges} />
            )}
            {state.error && <div className="error banner">{state.error}</div>}
            {streaming && state.entries.length === 0 && (
              <div className="hint">正在等待助手输出…</div>
            )}
          </div>

          {state.pendingApproval && (
            <ApprovalDialog
              approval={state.pendingApproval}
              onDecision={(choice) =>
                onApprovalDecision(state.pendingApproval!.requestId, state.pendingApproval!.toolName, choice)
              }
            />
          )}

          {hasQueuedMessages(state.queue) && (
            <QueuePanel queue={state.queue} onClear={onClearQueue} />
          )}

          <footer className="composer">
            {streaming && (
              <button className="abort" onClick={onAbort}>
                中止
              </button>
            )}
            <textarea
              value={draft}
              placeholder={state.status === "ready" ? "输入提示,与 Pi 对话…" : "会话尚未就绪"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={
                !streaming && state.status !== "ready" && state.status !== "done" && state.status !== "aborted"
              }
              rows={3}
            />
            {streaming && (
              <div className="composer-bahavior" role="group" aria-label="发送方式">
                <span className="behavior-label">发送方式</span>
                <button
                  className={`behavior-btn ${behavior === "steer" ? "active" : ""}`}
                  onClick={() => setBehavior("steer")}
                  title="注入:回合进行中插入,不打断现有执行"
                >
                  注入
                </button>
                <button
                  className={`behavior-btn ${behavior === "followUp" ? "active" : ""}`}
                  onClick={() => setBehavior("followUp")}
                  title="排队:等当前回合结束后再执行"
                >
                  排队
                </button>
              </div>
            )}
            <button
              className="primary send"
              onClick={handleSubmit}
              disabled={
                !draft.trim() ||
                (streaming
                  ? behavior === undefined
                  : state.status !== "ready" && state.status !== "done" && state.status !== "aborted")
              }
            >
              发送
            </button>
          </footer>
        </main>
      </div>

      {settingsOpen && (
        <SettingsPanel
          state={state}
          trustInfo={trustInfo}
          onSetModel={onSetModel}
          onSetThinking={onSetThinking}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function Message({ entry }: { entry: { role: string; text: string } }): JSX.Element {
  if (entry.role === "user") {
    return (
      <div className="message user">
        <div className="bubble">{entry.text}</div>
      </div>
    );
  }
  return (
    <div className="message assistant">
      {entry.text ? (
        <ReactMarkdown>{entry.text}</ReactMarkdown>
      ) : (
        <div className="hint">…</div>
      )}
    </div>
  );
}

const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  running: "运行中",
  done: "完成",
  error: "出错",
};

/**
 * A single tool execution rendered as a collapsible card: a one-line header
 * (name + live status) that toggles the detail pane (arguments + result).
 * Running cards expose an abort button — implemented as a turn-level abort, the
 * only abort Pi exposes (session.abort()), which also stops the running tool.
 */
function ToolCard({
  tool,
  onAbort,
}: {
  tool: ToolExecution;
  onAbort: () => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(tool.status === "running");
  const hasArgs = Object.keys(tool.args).length > 0;
  const hasDetail = hasArgs || Boolean(tool.partialResult) || tool.status === "error";

  return (
    <div className={`tool-card tool-${tool.status}`}>
      <div
        className="tool-card-head"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((e) => !e);
          }
        }}
      >
        <span className={`tool-caret ${expanded ? "open" : ""}`}>▸</span>
        <span className="tool-name">{tool.toolName}</span>
        <span className={`tool-status tool-status-${tool.status}`}>
          {TOOL_STATUS_LABEL[tool.status]}
        </span>
        <span className="tool-card-spacer" />
        {tool.status === "running" && (
          <button
            className="tool-abort"
            title="中止当前回合(同时停止该工具)"
            onClick={(e) => {
              e.stopPropagation();
              onAbort();
            }}
          >
            中止
          </button>
        )}
        {!hasDetail && <span className="tool-card-empty">(无输出)</span>}
      </div>

      {expanded && hasDetail && (
        <div className="tool-card-body">
          {hasArgs && (
            <div className="tool-args">
              <div className="tool-section-label">参数</div>
              <pre className="tool-args-pre">{JSON.stringify(tool.args, null, 2)}</pre>
            </div>
          )}
          {tool.partialResult && (
            <div className="tool-result-block">
              <div className="tool-section-label">结果</div>
              <pre className="tool-result">{tool.partialResult}</pre>
            </div>
          )}
          {tool.status === "error" && tool.error && (
            <div className="tool-error-detail">⚠ {tool.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

const DIFF_KIND_LABEL: Record<FileChange["kind"], string> = {
  added: "新增",
  modified: "修改",
};

/**
 * The diff review list (ticket 06): the files Pi changed in the current turn,
 * each expandable into a lightweight diff. Scoped by the reducer to the active
 * turn/session, so this only reflects what the current agentic turn did.
 */
function FileChangeList({ files }: { files: FileChange[] }): JSX.Element {
  return (
    <div className="file-change-list">
      <div className="file-change-head">
        <span className="file-change-title">文件改动</span>
        <span className="file-change-count">{files.length}</span>
      </div>
      {files.map((file) => (
        <FileChangeItem key={file.path} file={file} />
      ))}
    </div>
  );
}

function FileChangeItem({ file }: { file: FileChange }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="file-change">
      <div
        className="file-change-row"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className={`file-change-caret ${open ? "open" : ""}`}>▸</span>
        <span className={`file-change-kind kind-${file.kind}`}>
          {DIFF_KIND_LABEL[file.kind]}
        </span>
        <span className="file-change-path" title={file.path}>
          {file.path}
        </span>
      </div>
      {open && file.diffText !== "" && <DiffView text={file.diffText} />}
      {open && file.diffText === "" && (
        <div className="diff-empty">(无改动内容)</div>
      )}
    </div>
  );
}

/**
 * A lightweight diff renderer: each line is classed by its leading marker
 * (+ added / - removed / @ hunk header / anything else as context), so the CSS
 * can color it without any third-party diff library. Plain text both-ways; all
 * data is Pi's own read-only patch/content captured by the reducer.
 */
function DiffView({ text }: { text: string }): JSX.Element {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <pre className="diff-view" aria-label="diff">
      {lines.map((line, i) => {
        const cls = diffLineClass(line);
        return (
          <div key={i} className={`diff-line ${cls}`}>
            {line === "" ? " " : line}
          </div>
        );
      })}
    </pre>
  );
}

/** Classify a diff line for styling: added / removed / hunk-header / context. */
function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  return "diff-ctx";
}

/** Whether Pi has any pending inject/queue messages worth showing (ticket 08). */
function hasQueuedMessages(queue: QueueState): boolean {
  return queue.steering.length > 0 || queue.followUp.length > 0;
}

/**
 * The queue panel (ticket 08, ADR-0003): shows Pi's pending inject (steering)
 * and queue-for-later (followUp) messages, and lets the user clear them back.
 * Note: Pi's `clearQueue()` clears both queues (the SDK exposes no per-item
 * removal), so this surfaces a single clear-all action.
 */
function QueuePanel({ queue, onClear }: { queue: QueueState; onClear: () => void }): JSX.Element {
  return (
    <div className="queue-panel">
      <div className="queue-head">
        <span className="queue-title">待发送</span>
        <button className="queue-clear" onClick={onClear} title="清空所有待发送消息">
          清空
        </button>
      </div>
      {queue.steering.length > 0 && (
        <div className="queue-group">
          <span className="queue-group-label">注入</span>
          {queue.steering.map((text, i) => (
            <div key={`s-${i}`} className="queue-item">
              <span className="queue-kind">⤴</span>
              <span className="queue-text">{text}</span>
            </div>
          ))}
        </div>
      )}
      {queue.followUp.length > 0 && (
        <div className="queue-group">
          <span className="queue-group-label">排队</span>
          {queue.followUp.map((text, i) => (
            <div key={`f-${i}`} className="queue-item">
              <span className="queue-kind">⏱</span>
              <span className="queue-text">{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ApprovalDialogProps {
  approval: PendingApproval;
  onDecision: (choice: ApprovalChoice) => void;
}

function ApprovalDialog({ approval, onDecision }: ApprovalDialogProps): JSX.Element {
  const [reason, setReason] = useState("");
  const [remember, setRemember] = useState(false);

  const handle = (decision: "allow" | "deny"): void => {
    onDecision({
      decision,
      reason: decision === "deny" && reason.trim() ? reason.trim() : undefined,
      remember,
    });
  };

  return (
    <div className="approval-overlay">
      <div className="approval-dialog">
        <div className="approval-head">
          <span className="approval-title">工具执行审批</span>
          <span className="approval-tool">{approval.toolName}</span>
        </div>
        <p className="approval-prompt">
          Pi 请求执行 <code>{approval.toolName}</code> 工具,是否允许?
        </p>
        <pre className="approval-args">{JSON.stringify(approval.args, null, 2)}</pre>
        <label className="approval-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          记住此工具的默认选择,不再逐回合询问
        </label>
        <input
          className="approval-reason"
          placeholder="拒绝原因(可选,会传达给 Pi 以便调整)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="approval-actions">
          <button className="approval-deny" onClick={() => handle("deny")}>
            拒绝
          </button>
          <button className="approval-allow" onClick={() => handle("allow")}>
            允许
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ordered thinking levels the settings panel offers (SDK ThinkingLevel set). */
const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const TRUST_LABEL: Record<TrustInfo["defaultProjectTrust"], string> = {
  ask: "询问(每次遇到项目本地资源时询问)",
  always: "始终信任(自动加载项目本地资源)",
  never: "从不信任(忽略项目本地资源)",
};

/**
 * The settings drawer (ticket 06): switch provider/model and thinking level for
 * the active session, and surface Pi's trust posture read-only. The trust
 * posture is Pi's *input-loading* gate for project-local resources — explicitly
 * kept apart from PiCode's per-tool approval gate on purpose.
 */
function SettingsPanel({
  state,
  trustInfo,
  onSetModel,
  onSetThinking,
  onClose,
}: {
  state: ChatState;
  trustInfo: TrustInfo | null;
  onSetModel: (modelRef: string) => void;
  onSetThinking: (level: string) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">设置</span>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3 className="settings-section-title">模型</h3>
          {state.models.length > 0 ? (
            <div className="settings-model-list">
              {state.models.map((model) => (
                <button
                  key={model.ref}
                  className={`settings-model ${model.ref === state.model ? "active" : ""}`}
                  onClick={() => onSetModel(model.ref)}
                  title={model.ref}
                >
                  {model.ref}
                </button>
              ))}
            </div>
          ) : (
            <p className="settings-hint">当前:{state.model ?? "未知"}(可用模型列表为空)</p>
          )}
          <p className="settings-note">
            切换通过 Pi 官方 setModel 生效;需要该模型已配置凭据。
          </p>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">思考级别</h3>
          <div className="settings-thinking-list">
            {THINKING_LEVELS.map((level) => (
              <button
                key={level}
                className={`settings-thinking ${level === state.thinking ? "active" : ""}`}
                onClick={() => onSetThinking(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">信任口径(Pi 项目资源加载)</h3>
          {trustInfo ? (
            <>
              <p className="settings-trust-current">
                当前:{TRUST_LABEL[trustInfo.defaultProjectTrust]}
              </p>
              <p className="settings-note">
                此目录{trustInfo.hasTrustResources ? "存在" : "未检测到"}需信任的项目本地资源。
              </p>
            </>
          ) : (
            <p className="settings-hint">信任口径不可用</p>
          )}
          <p className="settings-note">
            这是 Pi 是否加载项目本地资源(.pi/settings、扩展、skills)的闸门,与上方
            的"工具执行审批"不同——工具审批是每次工具运行前的单独闸门,二者并存、
            互不混淆。此处仅只读展示,PiCode 不修改 Pi 的信任配置。
          </p>
        </section>
      </div>
    </div>
  );
}
