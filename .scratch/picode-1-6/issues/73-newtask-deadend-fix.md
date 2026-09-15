# 73: New Task 死端修复——会话行点击必达

**What to build:** New Task 空态下点侧栏**任何会话行必然离开 New Task 主区**、主区切到目标会话：会话行打开路径的「已聚焦」与「在应用内（注册表活 host）」两分支补清 New Task 态标志（现在只切了注册表焦点，主区仍渲染空态——对照操作者痛点「点了没反应」）；跟随（Live Follow）与 resume 路径已有清理、不回归；灰行解释 toast 路径不回归。

**背景（取证）：** 会话行打开 handler 的前两分支缺 New Task 态清理；主区渲染条件以 New Task 态优先——焦点在后台换了、界面不动。file:line 级根因见 `../intake-grilling.md` R9 节。回归级可用性缺陷。

**Blocked by:** None (can start immediately).

## Comments

- 2026-09-15（implement session，t73-newtask-switch @ 0063b22，rebased on main 9304283）：修复 = `App.tsx handleOpenSession` 两分支（`summary.id === focusedId` / `inAppIds.has`）各补 `setNewTaskOpen(false)`——对齐通知 focus 路径既有清理；灰行早退分支不动（解释 toast 语义保持）。electron smoke 新增 ticket-73 stage（`src/main/smoke.ts` 末尾）：New Task 态依次点已聚焦行（①）/ 非在应用 quiet 行（②，resume 路径 + takeover 完成）/ 在应用活 host 行（③，同 pid 纯焦点切换）/ TUI-live 行（④，FollowView）+ 点回聚焦行退出 Follow（⑤）；quiet 目标 = 真实会话文件拷贝（改写 header id/cwd + 追加标记回合 + backdate）——独立项目组避开 ticket-39 Show-more 分页截断。**RED→GREEN 实证**：修复前 RED 跑挂在 `newtask_switch_focused_ok`（死端复现）；修复后两轮全绿（rebase 前后各一轮），`multi_shutdown_no_orphans_ok 16 hosts`。vitest 1321/1321，typecheck 清，改动文件 lint 清（packages-service.test.ts 两处 unused-var 为 64 遗留、非本票文件）。审查：双轴（Standards/Spec）通过，零范围蔓延、零契约增量。

**Status:** ready-for-human

- [x] electron smoke：New Task 态点活会话行 / 已聚焦行 / 非在应用行——三类都切走主区（`newtask_switch_focused/inapp/resume_ok`，另加 follow 行与 follow 退出两锁）
- [x] Live Follow / resume / 灰行 toast 路径不回归（④/② 锁 + 全套 electron smoke 绿含 ticket-54 灰行 stage）
- [x] 纯 renderer 状态修，零契约增量（App.tsx 两分支各一清标志；contract 零改动）
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）——每次运行前检查，且撞见 wt-68 并跑时等待其结束
