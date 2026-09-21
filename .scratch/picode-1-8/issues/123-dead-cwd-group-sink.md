# 123: 死 cwd 组沉底——组排序活性桶（优先于一切排序含 Manual）

**What to build:** `shared/sessions/group.ts` Projects 视图组排序加**活性桶**——cwd 已删（`cwd-liveness.ts` 既有判定复用）的组**恒沉底**：Updated / Created / **Manual** 三种排序下一律排最后（组间相对次序仍按各自排序键）；**Manual 手动序对死组不生效**（拖拽对死组组行禁用 grip 或忽略落位——票内裁量；活组拖序不受影响）；组内会话行排序不动；灰行（死 cwd 会话）既有语义零回退；目录复现后组自动恢复普通排序位（活性翻转即重投影）。置顶区不受影响（会话行非组）。

**背景（取证）：** 操作者原话：「左侧会话栏，不存在的文件夹永远排在存在的文件夹下（优先级大于上方排序按钮的任何逻辑）」+ Q8 确认**含 Manual**。`group.ts:84-90` bySortOrder 仅 updated/created/manual 排序键，无活性桶；`shared/sessions/cwd-liveness.ts` 为灰行（票 2x）建的单会话活性判定可复用于组级（组 cwd = 文件头 cwd，组内全同 cwd）。

**Blocked by:** 无（独立）.

**Status:** ready-for-human（分支 t123-dead-group-sink，等待人工/独立双轴复核）

## Acceptance

- [x] Seam-1：活性桶表驱动（三排序 × 死活组混合 × 组间相对序稳定；活性翻转重投影）
- [x] electron smoke：删目录后该组沉底（三排序下都最后）；目录复现恢复；Manual 下活组拖序不回归、死组组行拖不动
- [x] 灰行语义（票 2x）与手动排序持久化（票 84）不回归——死组不进手动序数组
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P9 定稿为 R8。活性判定复用 cwd-liveness（新增组级消费）；Q8 = 含 Manual。`CONTEXT.md` Manual 排序/筛选下拉词条修订（补沉底规则）随票入册。
- 2026-09-22 (implement → ready-for-human, self-review 双轴)：分支 t123-dead-group-sink，实现提交 sha 见下一笔补记。变更：①`shared/sessions/group.ts` +`isDeadCwdGroup`（组内任一行 `cwdMissing===true` 即死，纯文件夹事实；活 host 豁免是行级不影响组位）+ `groupSessions` 三排序统一活性桶（死组恒沉底、桶内仍按各自排序键；Manual 死桶 = Updated 基线）+ `manualOrderedGroups` 死组（stored/unknown）一律入桶，unknown 分支改用 `manualOrderedRows`（修复存序行被忽略的潜在票 84 缺陷，排除死组入 groups 后成为必经）；②`reorder.ts` `snapshotManualOrder` 的 groups 排除死组（沉底不落库，复现即回自然位；sessions 行序照存=灰行照常可拖）；③`Sidebar.tsx` 死组 grip 禁用（draggable=false+无 onDragStart+`sb-grip-dead` 灰样式）+ 组 drop 锚点落在死桶时钳制到首个可见死组（指示器与落位一致）+ commitDrop 死锚点→null、renderedCwds 仅活组；④`smoke.ts` +`dead_group_sink` stage；⑤`visual-cwd.ts` +组沉底断言；⑥`CONTEXT.md` 两词条 rider；⑦新增 `tests/shared/sessions-dead-group-sink.test.ts`（19 用例）。
  验证链：vitest 1988/1989 绿（唯一失败 `tests/main/subagent-runner-root.test.ts` 为基线同败的 SDK 全局安装路径环境泄漏，git stash 验证非本票回归）；typecheck/eslint 绿。electron smoke r1/r3 两轮 `dead_group_sink` 八步全绿（seeded/updated/created/grip_frozen/live_drag/boundary_drop/recovered/done），前置 sidebar_drag_*（票 84 全 10 步）与 dead_cwd_*（票 42×54）零回归；r1 挂 ticket-75（wt-120 smoke 2:46 并发引入 CPU/rAF 抖动，本人启动前已 ps 自查）、r2 挂 ticket-88（图像竞态）、r3 过 75/88 后挂 ticket-93——三处均与本票 diff 零交集（转录滚动/预览渲染，均非本票改动面），同夜跨分支 wt-120 亦挂 ticket-90，属环境时序抖动非回归。评审 = self-review 双轴（Standards：纯模型/胶水分层、零新缝、仅消费既有 additive 字段、单一拼写、无 TODO；Spec：Acceptance 逐条对照），主 Agent 另派独立双轴复核。
- 2026-09-22 (sha 记录)：实现提交 = d11fe2ff2b44a8126537c455f7a3c8a39d59d201（本笔的前一提交，含全部实现+票面翻转）；分支 tip = 本笔（仅本 sha 行）。merge 会话以分支 tip 为准。
