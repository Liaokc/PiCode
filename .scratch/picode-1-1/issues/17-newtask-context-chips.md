# 17: 新建任务上下文继承——项目芯片替代系统选目录

**What to build:** ⌘N / New Task 的开台体验对齐 ZCode（2026-08-31 实机取证 + grilling 定稿）：
(a) **⌘N / New Task 打开「新任务空态」**（问候语 + Composer），**不再弹系统文件夹选择器**；空态 Composer 上方自带**项目芯片** `📁 <项目> ⌄`。
(b) **芯片默认值 = 当前活动会话的项目**；无活动会话时回落**上次使用目录**，仍无则最近项目列表首位。
(c) **点击芯片的下拉结构**（对照 ZCode 实拍 `/tmp/chip-dd.png`）：顶部**搜索工作区**输入框 + **最近工作区列表**（✓ 标注当前选择）+ 底部**「打开文件夹…」**项（系统选择器降级为下拉底部菜单项，不再是唯一路径）。
(d) 选中项目 + 输入发送 → 直接以该 cwd 建会话，首条消息不丢（沿用 pendingPrompt 链路）。
(e) 设置页 `newTaskDirectory: ask` 选项**退役**（弹窗语义被芯片取代），替换为「新任务默认项目」选择器（上次使用 / 固定项目）。

**不做（grilling 排除）**：分支芯片（Pi 会话不绑定分支，git checkout 属 Git 写操作，out of scope，见票 21 的只读替代）；ZCode 同面板的「远程连接」「不在项目中工作」（无对应概念——Pi 会话必须在项目目录中工作）。

**背景（证据）：**
- 操作者痛点 1 原话：「针对单个文件夹下的会话，没有针对某个文件夹直接新开会话的功能（现有的还需要选取工作文件夹）」。
- ZCode 实机：新建任务 → 空态问候 + Composer 上方项目/分支芯片，输入即开工（`/tmp/newtask.png`）；芯片下拉 = 搜索工作区 + 最近列表 + 底部「打开文件夹」（`/tmp/chip-dd.png`）。
- PiCode 现状：⌘N → `resolveNewTaskDirectory()`——设置 `ask` 时弹系统选择器，`last-used` 时静默用上次目录。
- 关联：分组行悬停三按钮（票 19）是同一痛点的侧栏入口；多活动会话（票 20）独立。

**Blocked by:** None.

**Status:** resolved

- [ ] ⌘N / New Task 打开新任务空态（不再弹系统选目录；`ask` 退役）
- [ ] 空态 Composer 上方项目芯片：默认 = 当前活动会话项目；回落链 = 上次使用 → 最近项目首位
- [ ] 芯片下拉 = 搜索工作区 + 最近工作区列表（✓ 当前）+ 底部「打开文件夹…」调系统选择器
- [ ] 选中项目 + 发送 → 直接建会话，首条消息（文本+图片）完整送达
- [ ] 设置页「新任务默认项目」选择器替换原 `ask|last-used` 二元项
- [ ] 视觉对照 ZCode 空态与下拉（`/tmp/newtask.png`、`/tmp/chip-dd.png`）
- [ ] `npm run smoke` ALL GREEN；空态→建会话链路 electron smoke 断言更新
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake): 建票（needs-triage——与痛点 1A/1B 的取舍待定）。取证：ZCode 新建任务实拍 `/tmp/newtask.png`；PiCode 现状代码 `App.tsx resolveNewTaskDirectory`。
- 2026-08-31 (grilling 定稿): R2-Q7 三条路线全做——本票先行；R3-Q6 定 ⌘N 行为与回落链；R5-Q2 定下拉结构（搜索+最近+底部打开文件夹；远程/项目外模式不做）。Status 改 ready-for-agent。
- 2026-08-31 (implement, t17-newtask-chips): 实现于 **e095ce0**。⌘N → 新任务空态（问候 + Composer + 项目芯片），系统选目录退役；默认解析器 `src/shared/new-task.ts`（纯函数 + 表驱动 vitest：fixed → 活动会话 → 上次使用 → 最近首位）；下拉照 ZCode（搜索工作区 + 最近列表 ✓ 当前 + 底部 Open folder…）；`ask` 值读回时迁移为 `last-used`，设置页换「New task default project」选择器（follow-recent / fixed + 选目录）；首条消息（文本+图片）经 pending 链路，electron smoke 新增 `newtask_*` 断言（芯片默认值 / 下拉形状 / 以芯片项目建会话 / 首条 prompt 送达）。验证：`npm test` 546/546、typecheck/lint 全绿、`npm run smoke` ALL GREEN（6 阶段）；视觉对照截图 `.scratch/visual/0-empty-state.png`、`0a-newtask-dropdown.png`（ZCode 基准 /tmp/newtask.png、/tmp/chip-dd.png 形状一致）。分支芯片/远程连接/项目外模式按 grilling 范围排除未做。**请操作者执行 `bash scripts/merge-ticket.sh 17`。**
- 2026-09-01 (验收截图)：`.scratch/compare/t17-empty-state.png`（空态芯片栏，对照 /tmp/newtask.png）、`t17-newtask-dropdown.png`（下拉：搜索+最近列表 ✓当前+底部 Open folder…，对照 /tmp/chip-dd.png）、`t17-settings-general.png`（设置页新「New task default project」选择器）。重生成：`npm run visual:transcript` / `npm run visual:settings`。

- 2026-08-31 (merge session, T00): merged as **f36e6cc** (`merge: t17-newtask-chips`, rebase + no-ff onto main, 零代码冲突——分支基点即当时 main)。验收口径：操作者明确「已验收」；实现会话记录 vitest/typecheck/lint 全绿 + smoke ALL GREEN + code-review 双轴通过（`ask` 设置退役、默认项目解析器纯函数表驱动、首条消息 pending 链路）；合并后 main 上 typecheck + vitest 546/546 全绿。附：操作者验收截图归档 `.scratch/compare/t17-*.png`；合并会话将 post-17 harness 全套输出入库（0-empty-state 带芯片空态 / s3 设置新选择器 / 新帧 0a 下拉——属本票交付面的证据帧，非时间戳噪声）。
