# 28: 侧栏状态语义——选中跟随视图 + 未读状态点

**What to build:** 侧栏行视觉状态改为「当前视图」单一派生：点击 live 会话进入 Follow 后 **followed 行持选中样式、前 focused 行还原普通底色**（它若在跑仍显蓝色动画点——选中与运行解耦）；点回 focused 行退出 Follow、高亮跟回。配套**未读状态点**：非聚焦/非跟随期间会话文件增长（回合粒度）自动置未读，聚焦自动清；状态点体系加入**靛蓝实心未读态**，优先级 = 橙（待审批）> 蓝动画 > 绿（TUI 在写）> 靛蓝未读 > 空槽；未读为本地偏好持久化，会话文件零改动。手动 Mark as Unread/Read 的菜单入口随票 35（本票在纯模型层支持手动覆盖位）。

**背景（取证）：** 根因实证——`handleOpenSession` 对 live 会话只设 followedFile 不改 focusedId，前会话保持 `.sb-task-active`；followed 行仅 `bg-inset`（#f1f1ee）与侧栏底色不可分辨。ZCode 侧：session 表无未读字段（只读取证）——未读为本地态，对标偏好实现。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] Follow 激活：followed 行选中样式、focused 行还原；点回退出 Follow 高亮跟回；运行中的 focused 行动画点不受影响
- [x] 未读自动置位（非聚焦回合粒度）/ 聚焦自动清除；手动覆盖位模型就绪（UI 入口随票 35）
- [x] 状态点优先级表驱动扩展（橙 > 蓝动 > 绿 > 靛蓝 > 空槽；更高优先级遮蔽未读）；归档行不显示未读
- [x] 未读推导纯函数（水位 / 手动覆盖 / 归档排除）表驱动；偏好持久化重启保持
- [x] 会话文件零改动；electron smoke（follow 高亮断言 + 未读置位/清除）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q1（选中跟随视图）+ Q9（未读行为规则四项全按推荐）定稿。归类：交互缺陷（选中）+ 全新需求（未读）。波次：W1（Sidebar/App/preferences 唯一写者）。
- 2026-09-02 (implementation): 分支 t28-sidebar-selection，commit 81f5535。实现：
  - 选中 = `sidebarRowState(focusedId, followedFile, sessionId, sessionFile)` 单一派生（session-registry.ts，纯投影表驱动）；`.sb-task-followed`（bg-inset，不可分辨根因）退役；选中与运行解耦（状态点承担运行）。
  - 未读模型层 `src/shared/sessions/unread.ts`：mtime 水位 + 手动覆盖位（`setManualUnread`，菜单随票 35）；`AppPreferences.readStates` 持久化，patch 按会话 upsert 合并（racing writers 不丢项）；首次见到基线化（升级不淹没侧栏）；on-view 追 mtime + 清覆盖位（reading is the only way to make it read）；归档排除位预留（票 35）。
  - `sidebarDotState` 扩展 unread 位（靛蓝 #3f51b5 `--accent-indigo`）；优先级 橙>蓝动>绿>靛蓝>空槽 表驱动；in-app 行仍永不显绿点。
  - 测试：tests/shared/unread.test.ts（28 用例）+ session-registry/preferences 表扩展 + settings-service 往返；703/703 绿；typecheck/lint 绿。
  - electron smoke 新增 follow_selection_ok / follow_exit_ok / follow_reselected_ok / multi_selection_decoupled_ok / unread_masked_ok / unread_lit_ok / unread_cleared_ok，真跑全绿（round 3 加热身回合使其行可点击）。
  - CONTEXT.md：状态点（靛蓝未读 + 优先级）、Live Follow（选中跟随当前视图）、新词条 未读（Unread）。
  - code-review 双轴通过（standards：4 条判断型无硬伤；spec：无缺失无错误，2 个已记录的设计补充：首见基线、settingsLoaded 门控防启动竞态覆盖水位）。
  - 未自行 merge——请操作者执行：`bash scripts/merge-ticket.sh 28`
