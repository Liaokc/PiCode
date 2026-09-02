# 33: 筛选下拉——视图/排序 + createdAt 契约

**What to build:** 侧栏筛选钮改开 **ZCode 式下拉**（对照 `z-filter-menu.png`）：**视图**（By project / Timeline）+ **排序方式**（Updated / Created）。Timeline = 全会话平铺、置顶区保留顶部；排序纯函数进入分组流水线、作用于两种视图。**createdAt** 由 host 会话索引从文件 birthtime 补进 SessionSummary——契约纯增量，缺失优雅降级。连带：文本筛选行**退役**（⌘K 覆盖搜索）；Expand-all 死钮（R5 无 handler）**删除**。

**背景（取证）：** 现状为「Filter tasks」输入框（票 11 遗产）；ZCode 实拍下拉（`z-filter-menu.png`：视图 按项目✓/时间线 + 排序 更新时间✓/创建时间）。SessionSummary 现仅 modifiedAt。grilling Q8 四项定稿。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] FilterIcon 开下拉（视图 / 排序），形态对照实拍；当前选择持久化
- [ ] Timeline 平铺视图（置顶区保留顶部）；排序作用于两种视图
- [ ] createdAt 契约纯增量（birthtime 推导、缺失降级）；host-contract smoke 断言
- [ ] 文本筛选行退役；Expand-all 死钮删除
- [ ] 排序/视图纯函数表驱动（sessions-group 套件扩展）；electron smoke / visual 核验；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (merge session): 操作者明示已验收 → merged as **3ba4949** (merge --no-ff onto main @ 簿记 sync；feat `9c0594f` 重放)。零代差开合（merge-base = main tip），唯一冲突 = 票文件状态对撞（claimed vs main 终态）——例行取 main 侧，tracker 终态提交 c64cbc3 去重丢弃。main 终态审计：typecheck 绿，vitest **804/804**（63 files，+16 为 sessions-group/parse/preferences 用例），接缝幸存——Sidebar 筛选下拉 UI（26 处）、createdAt 进 types/parse 流水线、`visual:filter` 探针 + f1/f2/f3 签名帧入库（票特有新帧）、Sidebar 内 33 tools 区与 28 未读/34 行几何共存；既有 27/28/29/30/31/34 seam 全部完好，无冲突标记残留。33 合入即解锁 35（本票是 35 唯一未清阻塞）。
- 2026-09-02 (requirements intake): 建票。grilling Q8 定稿（①置顶区保留 ②createdAt 可做 ③文本筛选退役 ④删 Expand-all、Trash 接归档）。归类：全新需求（含契约增量）。波次：W3（Sidebar tools 区写者，与 35 TaskItem 区不相交）。
- 2026-09-02 (implement, sha 757f230): 五项验收全落地。① FilterIcon 开 ZCode 式下拉（视图/排序两组、勾选态、选择持久化进偏好，`visual:filter` f1 对照实拍）；② Timeline 全平铺、置顶区保留顶部，排序纯函数（`sessionCreatedMs` birthtime→会话头降级→0）进 `groupSessions`/`timelineSessions`，表驱动 13 例进 sessions-group 套件；③ `SessionSummary.createdAt` 契约纯增量（index-service 从 `stat.birthtimeMs` 推导、缺失→null），host-contract smoke 对真实 SDK 会话文件断言 birthtime 推导 + 旧字段完好；④ 文本筛选行退役（`filterSessions` 助手一并删除，⌘K 覆盖搜索）、Expand-all 死钮删除；⑤ typecheck / lint / 804 单测 / host-contract smoke（含新 createdAt 阶段）/ electron smoke / `visual:filter`（下拉形态、时间线平铺、created 排序按真实 birthtime 重排、reload 持久化，全断言通过）全绿。**两处自主裁定请操作者复核**：(a) Groups/Projects 切换钮一并退役——视图选择唯一入口收敛到下拉（实拍中视图项在下拉内；双视图开关会冲突），TaskItem 未动；(b) 视觉核验新增 `npm run visual:filter`（可断言 harness，非纯截图）。验证截图 f1–f3 在 `.scratch/visual/`。合并：`bash scripts/merge-ticket.sh 33`。
