# 43: History 树重塑——显示形态对齐 Pi /tree

**What to build:** 会话头部 History 下拉（树面板）重塑为 Pi TUI `/tree` 的**显示形态**（pitui13-tree 对照帧）：每行**类型标签着色**（`user:` / `assistant:`）；**工具调用入树**——自 assistant 消息 toolCall 块推导 `[名称: 参数摘要]` 等宽行（现状工具行整段缺席，需扩展树数据源的节点预览）；`(model_change)` 等 other 类噪音条目**默认隐藏**；树形缩进导轨；叶路径高亮、"current" 标记、行尾 fork、点行跳转全部保留。配色字体用桌面 app 自有体系，**TUI 键盘功能（搜索/label/copy/filters）明确不做**（Q8）。

**背景（取证）：** 现状 `nodePreview` 原文直出（parse 一文件——`(model_change)` 等噪音混排、无类型标识、无导轨；截图 pi13-history-dropdown）；对标物 pitui13-tree。

**Blocked by:** 42（parse 同文件双写者——标题推导与节点预览同文件，已实证）。

**Status:** ready-for-agent

- [ ] 显示行序列 = SessionTreePayload 的纯函数推导：类型标签着色 / 工具行 / 噪音滤除 / 叶路径高亮
- [ ] 工具调用入树：`[名称: 参数摘要]` 等宽行（树数据源节点预览扩展）
- [ ] 噪音条目（other 类）默认隐藏；缩进导轨；视觉对照 pitui13-tree
- [ ] 点行跳转 / 行尾 fork / current 标记行为不回归
- [ ] 树显示模型纯函数表驱动（Seam-1：fixture jsonl → 显示行序列，sessions-trace 套件同型）
- [ ] visual 帧核验（对照 pitui13-tree）；electron smoke 回归（跳转/fork）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R3，grilling Q3+Q8）。载荷构建器先例 sessions-trace；视觉对照帧已归档。波次：W2。
