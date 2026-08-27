# 01: 净场与脚手架——窗口骨架

**What to build:** 以一次 reset 提交固化工作区清理（只留文档/ADR/参考件），随后 Electron 壳立起来：hiddenInset 红绿灯嵌侧栏、居中窗口标题、三区布局（左导航轨+任务列表骨架 / 主区空态 / 右侧面板收起）、空态问候+居中 Composer 静态版。`npm run dev` 一键起窗。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] reset 提交落盘：移除旧实现残留，仓库处于"全新起点 + 文档资产"状态
- [x] `npm run dev` 启动无报错窗口，typecheck/lint/test 脚本可用且绿
- [x] 标题栏形态对照基准截图（红绿灯位置、标题居中）通过
- [x] 三区布局静态呈现，空态结构与截图 02/03 的构图一致（问候语、Composer 卡片、快捷芯片槽位）

## Comments

**2026-08-27 — agent session (t01-reset-and-shell, merged from wt-01)**

- Implemented in worktree `.worktrees/wt-01`, branch `t01-reset-and-shell`; commits 21d66ab / 061111f / d94085b.
- Scaffold: Electron + React + TS strict via electron-vite; scripts `dev/build/start/typecheck/lint/test` all green (vitest 16 tests).
- TDD at three headless seams: greeting clock logic, shell layout reducer (`initialShellUiState` = screenshot-02 launch state), window options contract (`hiddenInset`, isolation). Red→green confirmed for each.
- Shell per screenshots 02/03: frameless window with traffic lights over the sidebar + centered title; nav rail + task-list skeleton; empty state (watermark π, time-aware English greeting, static composer card, quick-start chips); collapsible side panel whose picker offers Review/Terminal only (browser out of scope). ASK/init chips hidden per spec. Both compositions captured & compared during dev (`VITE_PICODE_FAKE_HOUR`, `VITE_PICODE_PANEL_OPEN` QA hooks added for deterministic screenshot runs).
- Two-axis code review run post-implementation; findings fixed in d94085b (brand-string dedup, dead icon removal, debug-log trim, d.ts lint carve-out). Reviewer notes carried to human visual gate: sidebar intentionally omits Automation/Plugin-marketplace rows (features not in PiCode scope); watermark is an original π mark rather than ZCode's glyph. Final-capture screenshot came back black (display asleep); composition had been verified pre-refactor and fixes touched no render path.

