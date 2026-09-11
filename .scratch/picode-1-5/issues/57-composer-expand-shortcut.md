# 57: Composer 展开钮快捷键 ⌘E

**What to build:** ⌘E 全局 toggle 输入展开态：作用于当前聚焦会话的 composer，New Task 空态同享（共组件）；展开时再按收回（自反）；既有收回三路（再点 / Esc / 发送成功后）不变；FollowView 无 composer 自然 no-op。展开钮 tooltip 按纪律改为**键帽 ⌘E**（有快捷键只显键帽，不再显 "Expand input" 短描述）。

**背景（取证）：** 全局键位表（物理 code、meta-only、⌥ 拒绝——票 27 表驱动先例）现有 ⌘N/⌘K/⌘J/⌥⌘J/⌘B/⌥⌘B，**KeyE 空闲**；展开状态机（票 49 Seam-1 纯函数）有 click/Esc/send 事件、无键位事件。操作者候选 ⌘E vs ⌥⌘E（Q4 拍板 ⌘E，全局生效）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 键位表增 KeyE 行（meta-only、⌥ 拒绝、ctrl/shift 拒绝）——表驱动用例（keymap 套件扩展）
- [ ] 展开状态机新增键位事件（与 click/Esc/send 并列的纯函数扩展；非法迁移拒绝；collapsed↔expanded toggle）——状态机套件扩展
- [ ] App 层把解析出的动作路由至当前聚焦会话的 composer；New Task 空态同生效；FollowView no-op
- [ ] tooltip 改键帽 ⌘E（Tooltip 纪律：有快捷键只显键帽）
- [ ] electron smoke：⌘E 在两处 composer toggle（含展开态再按收回）+ tooltip 键帽断言
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 57`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R2，Q4=A）。波次 W1。与 58 文件不相交（本票触 keymap/展开状态机/App/Composer 组件，58 纯 app.css padding）——可并行。1.4 范围外项转正。
