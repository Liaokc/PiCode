# 21: 分支只读展示

**What to build:** 显示当前活动会话工作区所在的 **git 分支名（只读）**：
- host 增只读 IPC 命令（如 `get_branch`：`git rev-parse --abbrev-ref HEAD`；非 git 目录 / 命令失败返回 null）——契约纯增量。
- UI 展示位置实施时定（建议：会话标题栏项目名旁的小徽标）；切换会话/工作区时随之刷新。
- **不做**：分支切换 / checkout。事实依据：Pi 会话头仅记录 `cwd`，实测 4 个会话文件全文 0 处 branch 字段——Pi 会话不绑定分支（grilling R2-Q8 操作者规则：不绑定→只读）；且分支切换意味着 git 写操作（out of scope）。

**背景：** ZCode 标题栏 `⋯` 即分支切换器（实拍 `z-titlebar-menu.png`），其会话模型绑定分支；PiCode 对标时降级为只读展示（grilling R4-Q1 定）。

**Blocked by:** None.

**Status:** ready-for-agent（**优先级最低**，排在 14–20、22 之后）

- [ ] host `get_branch` 只读命令 + 契约纯增量（不改既有消息）
- [ ] UI 展示分支名；非 git 目录优雅降级（不显示，不报错）
- [ ] 会话切换 / 工作区变更时刷新
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。事实依据：会话头抽查（仅 cwd，无 branch）；ZCode 分支切换器实拍 `z-titlebar-menu.png`。优先级最低（R4-Q1）。
