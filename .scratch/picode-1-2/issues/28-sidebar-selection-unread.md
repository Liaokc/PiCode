# 28: 侧栏状态语义——选中跟随视图 + 未读状态点

**What to build:** 侧栏行视觉状态改为「当前视图」单一派生：点击 live 会话进入 Follow 后 **followed 行持选中样式、前 focused 行还原普通底色**（它若在跑仍显蓝色动画点——选中与运行解耦）；点回 focused 行退出 Follow、高亮跟回。配套**未读状态点**：非聚焦/非跟随期间会话文件增长（回合粒度）自动置未读，聚焦自动清；状态点体系加入**靛蓝实心未读态**，优先级 = 橙（待审批）> 蓝动画 > 绿（TUI 在写）> 靛蓝未读 > 空槽；未读为本地偏好持久化，会话文件零改动。手动 Mark as Unread/Read 的菜单入口随票 35（本票在纯模型层支持手动覆盖位）。

**背景（取证）：** 根因实证——`handleOpenSession` 对 live 会话只设 followedFile 不改 focusedId，前会话保持 `.sb-task-active`；followed 行仅 `bg-inset`（#f1f1ee）与侧栏底色不可分辨。ZCode 侧：session 表无未读字段（只读取证）——未读为本地态，对标偏好实现。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Follow 激活：followed 行选中样式、focused 行还原；点回退出 Follow 高亮跟回；运行中的 focused 行动画点不受影响
- [ ] 未读自动置位（非聚焦回合粒度）/ 聚焦自动清除；手动覆盖位模型就绪（UI 入口随票 35）
- [ ] 状态点优先级表驱动扩展（橙 > 蓝动 > 绿 > 靛蓝 > 空槽；更高优先级遮蔽未读）；归档行不显示未读
- [ ] 未读推导纯函数（水位 / 手动覆盖 / 归档排除）表驱动；偏好持久化重启保持
- [ ] 会话文件零改动；electron smoke（follow 高亮断言 + 未读置位/清除）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q1（选中跟随视图）+ Q9（未读行为规则四项全按推荐）定稿。归类：交互缺陷（选中）+ 全新需求（未读）。波次：W1（Sidebar/App/preferences 唯一写者）。
