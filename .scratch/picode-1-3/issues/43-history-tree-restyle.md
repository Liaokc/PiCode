# 43: History 树重塑——显示形态对齐 Pi /tree

**What to build:** 会话头部 History 下拉（树面板）重塑为 Pi TUI `/tree` 的**显示形态**（pitui13-tree 对照帧）：每行**类型标签着色**（`user:` / `assistant:`）；**工具调用入树**——自 assistant 消息 toolCall 块推导 `[名称: 参数摘要]` 等宽行（现状工具行整段缺席，需扩展树数据源的节点预览）；`(model_change)` 等 other 类噪音条目**默认隐藏**；树形缩进导轨；叶路径高亮、"current" 标记、行尾 fork、点行跳转全部保留。配色字体用桌面 app 自有体系，**TUI 键盘功能（搜索/label/copy/filters）明确不做**（Q8）。

**背景（取证）：** 现状 `nodePreview` 原文直出（parse 一文件——`(model_change)` 等噪音混排、无类型标识、无导轨；截图 pi13-history-dropdown）；对标物 pitui13-tree。

**Blocked by:** 42（parse 同文件双写者——标题推导与节点预览同文件，已实证）。

**Status:** ready-for-human

- [x] 显示行序列 = SessionTreePayload 的纯函数推导：类型标签着色 / 工具行 / 噪音滤除 / 叶路径高亮
- [x] 工具调用入树：`[名称: 参数摘要]` 等宽行（树数据源节点预览扩展）
- [x] 噪音条目（other 类）默认隐藏；缩进导轨；视觉对照 pitui13-tree
- [x] 点行跳转 / 行尾 fork / current 标记行为不回归
- [x] 树显示模型纯函数表驱动（Seam-1：fixture jsonl → 显示行序列，sessions-trace 套件同型）
- [x] visual 帧核验（对照 pitui13-tree）；electron smoke 回归（跳转/fork）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R3，grilling Q3+Q8）。载荷构建器先例 sessions-trace；视觉对照帧已归档。波次：W2。
- 2026-09-07 (implement): 已实施并提交 **64a89ec**（分支 t43-history-tree-restyle），Status→ready-for-human。
  - 核心：`src/shared/sessions/tree-view.ts` 新纯模块——`sessionTreeDisplayRows(SessionTreePayload) → TreeDisplayRow[]`（类型标签 user:/assistant:、工具行、other 类噪音隐藏且子节点透明晋升、分支点才出连接符/导轨（对齐 pitui13-tree 的单链平铺形态）、叶路径全展开 + 越径分支一级可见（沿用原面板策略）、current 标记落在叶路径最深可见行——叶条目本身是噪音（如回合中 toolResult 叶）时回退最近可见祖先）。
  - parse.ts：assistant 节点新增 `toolCalls`（additive 契约字段，`SessionTreeToolCallDTO`）+ `toolCallSummary`（Pi TUI /tree formatter 的桌面移植：bash 折叠截 50、read 行区间、read/write/edit 路径 ~ 缩写、grep/find、ls、未知工具 40 字 JSON；home 注入保持 shared 无 process 依赖，host 传 os.homedir()）；无文本 assistant 预览降级 (aborted) / 错误文本 / (no content)（pitui13-tree 帧内形态）。
  - TreePanel 重写为导轨单元格 + 类型标签 + label chip 渲染；桌面自有配色（与调用轨迹视图同源 kind 色：user=accent-blue、assistant=#16a34a、工具行等宽灰阶）；点行跳转 / 行尾 fork / current 标记 / Esc 与外点关闭行为不回归；TUI 键盘功能未搬（Q8）。
  - 测试：新增 tests/shared/sessions-tree-view.test.ts（fixture jsonl → 显示行序列，9 例表驱动，sessions-trace 同型）+ sessions-parse.test.ts 补工具摘要/降级预览用例；**1002/1002 绿**，typecheck / eslint 干净（仅 EmptyState.tsx 一条既有警告，非本票文件）。
  - 视觉：`npm run visual:tree` 新 harness（src/main/visual-tree.ts），tr43-tree 帧已核验并存档 `.scratch/picode-1-3/issues/43-history-tree-restyle/captures/1-tree-restyle.png`（断言：标签数、工具行文本、噪音 0、current 唯一、连接符/导轨、越径曾孙不泄漏）。
  - electron smoke：smoke.ts 新增 ticket-43 stage——种子分支会话 → History 面板（形态断言）→ 点旁支行跳转（session_tree leafId + current 跟随）→ 行尾 fork（session_created 新文件、原文件分毫不动）；`npm run smoke` 全套 6 阶段 **ALL GREEN**。
  - ⚠️ 计划外但必要：`scripts/smoke/run-all.sh` 的隔离 store 改绝对路径——BSD mktemp 对无斜杠模板在 **CWD 建目录且打印相对路径**（拼 $TMPDIR 又打印双斜杠），host 按自身 cwd 解析成绝对路径后 smoke 自家的 sessionFile 匹配器永远失配（ticket-42 stage 必超时；main 上同样必现，与本次改动无关）。另 noteEvent 失败转储补 sessionFile 详情（诊断该问题的关键）。两处均不触 IPC 契约，请操作者知悉。
  - 合并请走：`bash scripts/merge-ticket.sh 43`（本会话不自行 merge）。
