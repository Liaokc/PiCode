# 95: 一键折叠所有分组——Collapse all / Expand all

**What to build:** 侧栏 **Projects 分区行右侧常驻两个小钮：Collapse all / Expand all**（ZCode 同款动作对；R11/票 84 删除的分区行 grip 腾出的正是这个落点）。collapse-all = 全部组置折叠（各组保留折叠前形状记忆——票 39 语义不破）；expand-all = 全部展开（恢复各自记忆形状）；与手动单组折叠混用安全。仅 Projects 视图显示（Timeline 无分组、隐藏）；置顶区不受影响；无分组时 no-op；形状记忆仍会话期内存级（重启回默认——票 39 口径不变）。

**背景（取证）：** ZCode bundle `workspaceSidebar.collapseAllGroups`「收起全部」/ `expandAllGroups`「展开全部」；票 39 分组折叠现状（单组点击折叠、Show more 位置不丢）；fold-model（`shared/sessions/fold-model.ts`）为既有纯模型。

**Blocked by:** 84（侧栏拖拽重排——同 Sidebar/分区行区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：折叠聚合纯函数（collapse-all / expand-all × 各组形状记忆保留 × 手动单组混用）表驱动
- [ ] electron smoke：多组一键收起（组行全折叠）/ 一键展开（形状恢复，Show more 位置不丢）；Timeline 视图双钮隐藏
- [ ] 置顶区不受影响；重启回默认（内存级不破）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（Collapse all / Expand all）
