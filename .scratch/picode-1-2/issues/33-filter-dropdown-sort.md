# 33: 筛选下拉——视图/排序 + createdAt 契约

**What to build:** 侧栏筛选钮改开 **ZCode 式下拉**（对照 `z-filter-menu.png`）：**视图**（By project / Timeline）+ **排序方式**（Updated / Created）。Timeline = 全会话平铺、置顶区保留顶部；排序纯函数进入分组流水线、作用于两种视图。**createdAt** 由 host 会话索引从文件 birthtime 补进 SessionSummary——契约纯增量，缺失优雅降级。连带：文本筛选行**退役**（⌘K 覆盖搜索）；Expand-all 死钮（R5 无 handler）**删除**。

**背景（取证）：** 现状为「Filter tasks」输入框（票 11 遗产）；ZCode 实拍下拉（`z-filter-menu.png`：视图 按项目✓/时间线 + 排序 更新时间✓/创建时间）。SessionSummary 现仅 modifiedAt。grilling Q8 四项定稿。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] FilterIcon 开下拉（视图 / 排序），形态对照实拍；当前选择持久化
- [ ] Timeline 平铺视图（置顶区保留顶部）；排序作用于两种视图
- [ ] createdAt 契约纯增量（birthtime 推导、缺失降级）；host-contract smoke 断言
- [ ] 文本筛选行退役；Expand-all 死钮删除
- [ ] 排序/视图纯函数表驱动（sessions-group 套件扩展）；electron smoke / visual 核验；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q8 定稿（①置顶区保留 ②createdAt 可做 ③文本筛选退役 ④删 Expand-all、Trash 接归档）。归类：全新需求（含契约增量）。波次：W3（Sidebar tools 区写者，与 35 TaskItem 区不相交）。
