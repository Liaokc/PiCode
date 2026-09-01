# 21: 分支只读展示

**What to build:** 显示当前活动会话工作区所在的 **git 分支名（只读）**：
- host 增只读 IPC 命令（如 `get_branch`：`git rev-parse --abbrev-ref HEAD`；非 git 目录 / 命令失败返回 null）——契约纯增量。
- UI 展示位置实施时定（建议：会话标题栏项目名旁的小徽标）；切换会话/工作区时随之刷新。
- **不做**：分支切换 / checkout。事实依据：Pi 会话头仅记录 `cwd`，实测 4 个会话文件全文 0 处 branch 字段——Pi 会话不绑定分支（grilling R2-Q8 操作者规则：不绑定→只读）；且分支切换意味着 git 写操作（out of scope）。

**背景：** ZCode 标题栏 `⋯` 即分支切换器（实拍 `z-titlebar-menu.png`），其会话模型绑定分支；PiCode 对标时降级为只读展示（grilling R4-Q1 定）。

**Blocked by:** None.

**Status:** resolved

- [ ] host `get_branch` 只读命令 + 契约纯增量（不改既有消息）
- [ ] UI 展示分支名；非 git 目录优雅降级（不显示，不报错）
- [ ] 会话切换 / 工作区变更时刷新
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。事实依据：会话头抽查（仅 cwd，无 branch）；ZCode 分支切换器实拍 `z-titlebar-menu.png`。优先级最低（R4-Q1）。
- 2026-09-01 (implemented @ de325eb, t21-branch-readout):
  - host `get_branch`（`git rev-parse --abbrev-ref HEAD`，5s timeout；非 git 目录 / git 缺失 / unborn HEAD 一律 null）+ `branch_info` 事件——契约纯增量（union 仅追加，typecheck 证明无涟漪破坏）。
  - supervisor：无 host 会话的 `get_branch` 降级答 `branch_info(null)` 而非报错——visual harness 合成公告与崩溃会话聚焦不再弹错误 toast（单测钉死）。
  - UI：ChatView 顶栏标题旁只读徽标（GitBranchIcon + 椭圆截断，native title 显全名，遵循 CONTEXT.md tooltip 规则的数据揭示例外）；branch=null 整体隐藏。
  - 刷新时机：聚焦切换（effect）+ 每次会话公告（session_created → create/resume/fork/takeover）。
  - 验证：632 unit tests / typecheck / lint 全绿；host-contract smoke 增 `get_branch → branch_info` 阶段并实跑通过（git init smoke cwd，git 缺失时自动降级断言 null 路径）；electron smoke 全场景实跑通过。
  - 验收图：`npm run visual:transcript` 后 `.scratch/visual/`（1-midrun / 2-settled / 3b-replayed 等）顶栏项目名旁可见 `⑂ main` 徽标；本票已随票提交重拍图。实机验收：`npm run dev` 开本仓会话 → 徽标显 `t21-branch-readout`；开非 git 目录（如 /tmp）→ 徽标隐藏。
  - 备注（1.1 收官可补）：spec Testing Decisions 把 `get_branch` 场景列在 electron smoke 下——本票未加（smoke cwd 非 git 仓，正向断言需改 smoke.ts 的 cwd 策略，与在飞票 25 的碰撞面重叠）；host-contract smoke 已覆盖往返。另：fork 截图里的 'no live host' 红 toast 是票 16 既有 harness 噪音（fork 点击打到合成会话上），与本票无关。

- 2026-08-31 (merge session, T00): merged as **548f6cb** (`merge: t21-branch-readout`, rebase + no-ff onto main——分支已自行 rebase 到 714d4a0，仅 tracker 状态对撞 ×2 取终态)。验收口径：操作者明确「已验收」；实现会话记录 host `get_branch` 契约纯增量 + 非 git 目录优雅降级 + registry 感知刷新 + host-contract smoke 增阶段实跑通过 + typecheck/lint/632 unit tests 全绿。遗留备忘（1.1 收官可补，已记录于票内）：electron smoke 未加 get_branch 正向断言（smoke cwd 非 git 仓，与票 25 碰撞面）；fork 截图红 toast 为票 16 既有 harness 噪音。合并后 main 上 typecheck + vitest 632/632 全绿。
