# 95: 一键折叠所有分组——Collapse all / Expand all

**What to build:** 侧栏 **Projects 分区行右侧常驻两个小钮：Collapse all / Expand all**（ZCode 同款动作对；R11/票 84 删除的分区行 grip 腾出的正是这个落点）。collapse-all = 全部组置折叠（各组保留折叠前形状记忆——票 39 语义不破）；expand-all = 全部展开（恢复各自记忆形状）；与手动单组折叠混用安全。仅 Projects 视图显示（Timeline 无分组、隐藏）；置顶区不受影响；无分组时 no-op；形状记忆仍会话期内存级（重启回默认——票 39 口径不变）。

**背景（取证）：** ZCode bundle `workspaceSidebar.collapseAllGroups`「收起全部」/ `expandAllGroups`「展开全部」；票 39 分组折叠现状（单组点击折叠、Show more 位置不丢）；fold-model（`shared/sessions/fold-model.ts`）为既有纯模型。

**Blocked by:** 84（侧栏拖拽重排——同 Sidebar/分区行区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：折叠聚合纯函数（collapse-all / expand-all × 各组形状记忆保留 × 手动单组混用）表驱动
- [x] electron smoke：多组一键收起（组行全折叠）/ 一键展开（形状恢复，Show more 位置不丢）；Timeline 视图双钮隐藏
- [x] 置顶区不受影响；重启回默认（内存级不破）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（Collapse all / Expand all）

## Comments

- 2026-09-20 (implementation done): rebase main（t93-send-pin 已并入，84 基座在位，无冲突）后全量验证，branch tip 全绿。
  - **Seam-1 纯模型**（`src/shared/sessions/fold-model.ts` 扩展 + `tests/shared/fold-model.test.ts`，57 例全绿 = 42 既有 + 15 新增）：新增 `collapse-all` / `expand-all` 两个 action（携带 `cwds` = 侧栏当前渲染的组列表——隐藏项目不在列表、形状不动）。单次遍历只翻 `folded`，`visible` 步进原样保留（collapse-all 记形状 / expand-all 复原 = 票 39 单组语义的聚合放大）；不变组跳过 → no-op 恒返回**同引用**（空列表 / 无折叠态 / 重复 cwds 全覆盖）；与 `toggle-fold` 同栈天然混用。表驱动覆盖：聚合 × 形状记忆（1 步 10 行 / 2 步全展开 untouched 组回默认页）× 手动混用双向（expand-all 清手动折叠、聚合后单组 toggle 单独复开）× 列表外组隔离 × no-op 同引用 × 重复 cwds × 空状态物化零污染；整序大表追加 2 行（collapse-all 折叠 / 双钮对复原步进）。
  - **Sidebar UI**（`Sidebar.tsx` + `app.css`）：Projects 分区行 spacer 之后常驻两小钮（FoldIcon 收拢 / UnfoldIcon 张开——票 37 的 ZCode 字形，13px 图标 + 20px 命中区），aria-label/Tooltip 全英文 `Collapse all` / `Expand all`；点击 dispatch `{type:'collapse-all'|'expand-all', cwds: visibleProjectGroups.map(g=>g.cwd)}`。**仅 Projects 分支渲染**（Timeline 整行不渲染——双钮随之隐藏，零额外分支）；无分组时 cwds 空数组 → reducer 同引用 no-op；置顶区在行外（`.sb-scroll > .sb-task`），聚合不触碰。`.sb-section-action` 样式常驻（区别于组行 hover 显现的 `.sb-group-action`），faint 色收敛 hover 提亮。
  - **electron smoke**（`smoke.ts` 新 ticket-95 stage，10 个 `collapse_*`/`expand_*` 断言）：双组种子（A 12 会话可步进 / B 3 会话整页）→ 默认形状 + 双钮在位 → A 步进 10（种下非默认形状记忆）→ 右键菜单钉 B 会话（置顶区出现 1 行、B 剩 2）→ B 手动折叠（混用前置）→ **Collapse all**（A/B 全折叠 0 行 + 置顶行仍在）→ **Expand all**（A 复原 10|Show more 步进位置不丢、B 手动折叠被清回 2 行、置顶不动）→ Timeline 整行消失（双钮隐藏、钉行以 data-file 在场）→ 切回 By project（双钮回归 + 形状记忆仍在）→ `webContents.reload()` 重启代理（折叠回默认 5|Show more 而**钉行幸存**——localStorage 持久偏好 vs 内存级折叠，一次重启证两种语义）→ 收尾 unpin（后续 stage 零残留，票 84 惯例）。全部 stage 落 `group_fold_done`（39）之后、`sidebar_drag_start`（84）之前——Updated 排序域，零偏好写入。
  - **visual harness**（`visual-fold.ts` 扩展，`npm run visual:fold`）：种子第二组（3 会话）+ 通用化 group/state 探针；11 帧 f1–f6（票 39 既有）+ **c1–c5**（c1 分区行双钮在位、c2 一键全折叠、c3 形状复原、c4 Timeline 双钮隐藏、c5 切回复原）逐帧状态断言全绿，退位契约不变（base harness 对 PICODE_VISUAL_FOLD 让位）。
  - **vitest 1715/1715 + typecheck 双 tsconfig 清**；`npm run smoke` 全套 **ALL GREEN（437s，6 stages）**（`ps` 自查无其他 dev-app/smoke 进程；前 5 跑在负载 5.6–8.7 的桌面下先后于 ticket-68/83/93/scroll_stay 四个**既有真实输入/真实模型 stage** 各 flake 一次——与折叠域零代码交集，负载回落复跑即绿；我的 stage 每次被跑到都 10/10 全绿）。
  - 全英文文案（Collapse all / Expand all）；CONTEXT.md 新增**折叠聚合（Collapse all / Expand all）**词条。零契约增量（纯 renderer reducer + 展示层，无 IPC/偏好改动）。
  - **操作者：`bash scripts/merge-ticket.sh 95`。**
