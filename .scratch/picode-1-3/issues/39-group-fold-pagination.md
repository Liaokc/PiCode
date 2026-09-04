# 39: 分组折叠 + Show more 分页

**What to build:** 项目组列表的折叠与渐进展开。组行点击 = **整组折叠/展开**（非归档）：折叠收起全部会话行，再点展开并**恢复折叠前的形状**（若折叠前已 Show more 到第 N 步，展开即该步）；Show more 每次多显 5 条，直到全部展开后变为 "Show less"；**Show less 一次回到初始 5 条**；删除组行上的 caret 箭头（折叠职责归组行点击）。折叠形状为**内存级**（不进偏好，重启回默认 5 条）；折叠组头不加计数（Q9 拍板）。

**背景（取证）：** 现状 `toggleExpanded` 二值切换（全部↔前 5），Show more/less 与组行点击同 handler——功能重复且无真折叠（Sidebar.tsx 实证）；caret 在 >5 条时显示、随展开旋转。

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] 组行点击折叠/展开；展开恢复折叠前形状（步进位置不丢）
- [ ] Show more 每次 +5；全展开转 "Show less"；Show less 一次回初始 5 条
- [ ] caret 删除；组行其余悬停动作（⋯ / 查看文件 / 新任务）不受影响
- [ ] 形状机纯函数表驱动（Seam-1：初始/+5/showLess 重置/collapse 记形状/expand 复原）
- [ ] electron smoke（折叠/分页点击序 + 重启回默认）；visual 帧核验；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R5）。形状机同型先例 panel-model；Sidebar 本批唯一写者。波次：W1。
- 2026-09-03 (implementation start): claimed by worktree t39-group-fold (W1, Sidebar 唯一写者)。计划：Seam-1 fold-model 表驱动 TDD → Sidebar 组头区重写（删 caret）→ app.css 组头段清理 → electron smoke 折叠/分页点击序 + 重启回默认 → visual 帧核验。
