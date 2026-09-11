# 57: Composer 展开钮快捷键 ⌘E

**What to build:** ⌘E 全局 toggle 输入展开态：作用于当前聚焦会话的 composer，New Task 空态同享（共组件）；展开时再按收回（自反）；既有收回三路（再点 / Esc / 发送成功后）不变；FollowView 无 composer 自然 no-op。展开钮 tooltip 按纪律改为**键帽 ⌘E**（有快捷键只显键帽，不再显 "Expand input" 短描述）。

**背景（取证）：** 全局键位表（物理 code、meta-only、⌥ 拒绝——票 27 表驱动先例）现有 ⌘N/⌘K/⌘J/⌥⌘J/⌘B/⌥⌘B，**KeyE 空闲**；展开状态机（票 49 Seam-1 纯函数）有 click/Esc/send 事件、无键位事件。操作者候选 ⌘E vs ⌥⌘E（Q4 拍板 ⌘E，全局生效）。

**Blocked by:** None (can start immediately).

**Status:** resolved

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
- 2026-09-11 (implement, t57-composer-expand-shortcut @ f55c899 + 9518820): 全验收项落地，零新缝（keymap 套件 + expand 机器套件扩展 + electron smoke，全落 Seam-1 与既有 smoke 段）。
  - **keymap 表（ticket-27 表驱动先例扩展）**：`KeybindingAction` 增 `toggle-composer-expand`（additive 联合成员，零改名零移除）；`KEYBINDINGS` 增 `KeyE` 行（meta-only、无 alt 行——⌥ 拒绝、ctrl/shift 拒绝在 resolver 前置闸门）；套件新增 ⌘E describe（解析/⌥⌘E null/ctrl·shift null/裸键 null）+ 表完整性断言更新为七壳键（E N K J ⌥J B ⌥B）。
  - **展开状态机（票 49 Seam-1 纯函数扩展）**：`ComposerExpandEvent` 增 `'key'` 事件（与 toggle/escape/sent 并列，出处独立——'toggle' 是按钮点击，'key' 是 App 路由的 ⌘E chord）；决策表 collapsed×key=expanded、expanded×key=collapsed（自反 toggle），机器保持 total——非法配对被联合类型编译期拒绝，全表用例逐格钉死；既有收回三路（再点/Esc/sent）列零改动，套件原用例全过。
  - **App 层路由**：全局 keydown switch 增 `toggle-composer-expand` case → `window.dispatchEvent(TOGGLE_EXPAND_EVENT)`（OPEN_MODEL_MENU_EVENT 窗口事件先例）。同一时刻主区至多挂载一个 composer（ChatView ↔ EmptyState 三元互斥、共组件自动同享），监听者即当前聚焦会话的 composer；FollowView 无 composer 实例 → chord 自然 no-op。
  - **Composer 组件**：`transitionExpand` 改 useCallback（新 effect 复用，零逻辑重复）+ TOGGLE_EXPAND_EVENT 监听 → `transitionExpand('key')`；tooltip `<Tooltip label="Expand input">` → `<Tooltip shortcut="⌘E">`（Tooltip 纪律：有快捷键只显键帽，取代短描述；aria-label "Expand input" 保留作 a11y）。
  - **术语**：CONTEXT.md「输入展开（Composer Expand）」词条更新——⌘E 全局 toggle 入册（作用域/FollowView no-op/键帽 tooltip），原「无快捷键」表述废止。
  - **electron smoke**：既有票 49 composer_expand 段扩展——两处 tooltip 断言改键帽契约（label null + shortcut '⌘E'，empty-state 与 chat 两处）+ 新增 ⌘E toggle 块（两处 composer：展开 → EXPANDED_FORMULA 半区高投影 + aria-expanded=true → 再按收回至 74px 地板；新 `_ok` 标记 `composer_expand_key_empty_state_ok` / `composer_expand_key_chat_ok`）。⌘E 以物理 code 事件派发（ticket-27 段 press 先例）。既有收回三路（再点/Esc/发送成功后）断言零改动全过——零回归。
  - **gate 终态**：typecheck 绿；lint 0 error（1 警告系 EmptyState.tsx 既有，本票零触碰）；vitest **1134/1134（81 文件，净增 −1：删一处重言断言，见 review）**；electron smoke **ALL GREEN**（全链 `_ok` 全过、`multi_shutdown_no_orphans_ok 13 hosts`、`done`）；code-review 双轴完成（两处已修 9518820）。
  - **ps 自查**：smoke 前两度执行——首次发现上一运行残留（无），通道零并跑。首跑曾在票 25 bg_deny 段失败（deny reason 尾部多出「画＊」两字符）：取证为环境噪声非本票因果——pill 输入 autoFocus（ApprovalPill.tsx L71）+ 操作者物理键盘/输入法恰好落在输入焦点窗口，源码/构建产物 grep 零污染、本票 diff 不触 deny 路径；重跑即全绿。
  - **交接给合并会话**：完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 57`。
- 2026-09-11 (merge, T00 合并会话): **merged as b2e61df**（merge --no-ff；分支 rebase 后 feat= feat 侧两提交 59e638e 等，tracker 提交 810916b 自动去重 skipped）。
  - **验收口径**：操作者 2026-09-11 明示「57 已验收」；脚本门禁 typecheck 绿 + vitest **1134/1134（81 文件）**，与分支侧完全一致（1128 + ⌘E 套件/决策表新增 −1 重言断言）。
  - **冲突处置**：**零冲突**。rebase 时 tracker 提交自动去重（"skipped previously applied commit"，sync 043a861 先行使然）；CONTEXT.md（词条更新 vs 55/56 词条）、smoke.ts（票 49 段扩展 vs 三票阶段）、keymap/expand/App/Composer 与在途 58/59 无交叠。
  - **终态审计**：keymap `KeyE` 行 + `toggle-composer-expand` additive 联合成员（L26/L56）；expand 机器 `'key'` 事件四并列（L61）；App 路由 case → TOGGLE_EXPAND_EVENT（L447–453）；Composer 键帽 tooltip（L491）+ TOGGLE_EXPAND_EVENT 监听；CONTEXT「输入展开」词条 ⌘E 入册（L126，原「无快捷键」表述废止）；smoke `composer_expand_key` 两块（empty_state/chat）；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删。57 无下游阻塞票；在途 wt-58/wt-59 已提醒 rebase main。
