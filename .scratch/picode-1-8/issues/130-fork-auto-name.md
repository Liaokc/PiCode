# 130: fork 自动命名——Fork of …（host 落地即命名）

**What to build:** `handleFork` fork 落地后即刻自动命名：**源会话有名** → `Fork of <源名>`；**源无名** → `Fork of <侧栏标题投影>`（首条用户消息——与索引扫描器同源投影，`shared/sessions/parse.ts` 既有投影复用，Q7 裁决）；实现 = fork 前 `manager.getSessionName()` 取源名 → fork 落地后 `setSessionName`（写 **fork 自己的会话文件**——session_info 既有机制，与改名同写入面）；`session_renamed` 事件 + 侧栏索引刷新照旧（链路零新增）；用户可再改名（自动名不锁定、不阻止后续 set_session_label）。

**背景（取证）：** 操作者：「我希望fork 的会话会自动命名会话名字，就是之前的会话前面增加 "Fork of"」。`handleFork`（`host/index.ts:806-820`）现状 fork 后无命名——新 fork 会话无名列于侧栏。announceCurrentSession(true) → sendTree 链路已有（fork 的 History 问题另票 131）。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：命名投影表驱动（源有名 / 源无名→标题投影 / 源名超长截断——TITLE_MAX_CHARS 口径）
- [ ] electron smoke：fork 后侧栏与设置 = "Fork of …"（有名源与无名源两腿）；再改名成功（自动名可覆盖）
- [ ] fork 自身会话文件命名写入（session_info）与 ADR-0002 纪律一致性——只写 fork 新文件，源文件零改动
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P24 定稿为 R19。Q7 裁决（无名源跟侧栏标题投影）。与票 131（fork History 复现定位）同 fork 入口但不同症状——两票独立，若 131 的复现涉及 fork 流程改动需与本票协调 rebase。
