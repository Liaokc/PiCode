# 123: 死 cwd 组沉底——组排序活性桶（优先于一切排序含 Manual）

**What to build:** `shared/sessions/group.ts` Projects 视图组排序加**活性桶**——cwd 已删（`cwd-liveness.ts` 既有判定复用）的组**恒沉底**：Updated / Created / **Manual** 三种排序下一律排最后（组间相对次序仍按各自排序键）；**Manual 手动序对死组不生效**（拖拽对死组组行禁用 grip 或忽略落位——票内裁量；活组拖序不受影响）；组内会话行排序不动；灰行（死 cwd 会话）既有语义零回退；目录复现后组自动恢复普通排序位（活性翻转即重投影）。置顶区不受影响（会话行非组）。

**背景（取证）：** 操作者原话：「左侧会话栏，不存在的文件夹永远排在存在的文件夹下（优先级大于上方排序按钮的任何逻辑）」+ Q8 确认**含 Manual**。`group.ts:84-90` bySortOrder 仅 updated/created/manual 排序键，无活性桶；`shared/sessions/cwd-liveness.ts` 为灰行（票 2x）建的单会话活性判定可复用于组级（组 cwd = 文件头 cwd，组内全同 cwd）。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：活性桶表驱动（三排序 × 死活组混合 × 组间相对序稳定；活性翻转重投影）
- [ ] electron smoke：删目录后该组沉底（三排序下都最后）；目录复现恢复；Manual 下活组拖序不回归、死组组行拖不动
- [ ] 灰行语义（票 2x）与手动排序持久化（票 84）不回归——死组不进手动序数组
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P9 定稿为 R8。活性判定复用 cwd-liveness（新增组级消费）；Q8 = 含 Manual。`CONTEXT.md` Manual 排序/筛选下拉词条修订（补沉底规则）随票入册。
