# 02: Host 活体——最小聊天闭环

**What to build:** 用户选择工作目录后，独立 agent host 子进程以锁定版本的 Pi SDK 创建 Session 并完成第一轮真实对话：发送→逐词流式上屏→停止按钮中止。崩溃隔离（agent 死而窗口活，可重启会话）、退出无孤儿进程。自此确立 Seam-1：渲染层唯一事件来源是 IPC 契约，chat reducer 以纯函数承接。

**Blocked by:** 01 净场与脚手架。

**Status:** resolved

- [x] 选目录→建 Session→真实模型流式回复全程走通
- [x] 停止控制即时中止当前回合，应用保持可用
- [x] kill host 进程后 UI 出现清晰错误横幅并可重建会话，窗口不崩
- [x] 应用正常退出后系统内无残留子进程
- [x] reducer 纯函数测试就位：文本增量、agent_start/end、错误事件

## Comments

- 2026-08-28: implemented on `t02-host-live-chat-loop`, head `6d18336` (4 commits since `main` @ `1e2043f`).
- Seam-1 established: `src/shared/contract.ts` (ParentToHost / HostControlCommand / HostToParent) is the renderer's only event source; `src/shared/chat-reducer.ts` is a pure fold, 21 unit tests incl. purity + a guardrail test that fails if renderer sources ever import Pi SDK packages.
- Agent host: one forked process per Session (β shape), Pi SDK `@earendil-works/pi-coding-agent` pinned `0.84.3` exactly (ADR-0005); supervisor guarantees crash isolation (`host_exit`) and orphan-free teardown (shutdown → SIGTERM grace → disconnect self-exit; verified parent-SIGKILL self-cleanup).
- Verified real loops: `npm run smoke:host` (plain Node, real SDK, real model — stream, mid-stream abort, second turn, clean exit) and `npm run smoke:electron` (`PICODE_SMOKE=1`: adds renderer DOM assertion, host SIGKILL → unclean `host_exit` → rebuild on same cwd → `app.exit(0)`, no orphan processes after). `typecheck`/`lint`/`test` all green (37 tests).
- Human pass remaining: visual对照 screenshot 01 (streaming transcript + composer stop square) via `npm run dev`; pick-folder dialog, stop click and banner actions are dialog/mouse interactions not covered by the smokes.
- Merge from the root worktree: `cd ~/PiCode && git merge --no-ff t02-host-live-chat-loop`.
- 2026-08-28 (merge session): **resolved** — merged into main as `24b7e1f`. 验收口径：worktree tracker 提交 711b923 记录 human pass 已过（screenshot 01 目检 + smoke 证据在上方 Comments）；合并后 main 复核 typecheck 绿、210 vitest 全过。worktree `wt-02-host-live-chat-loop` 与分支 `t02-host-live-chat-loop` 已清理。
