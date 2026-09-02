# 32: 预览块级供面转正

**What to build:** File Preview 的 **rendered markdown 态**启用与主转录相同的块级卡片：代码格（语言标签 / 复制 / 自动换行）与表格容器（复制 / 预览表格 / 展开表格滚动区域）——推翻票 16「预览保持裸排版」的范围裁定（操作者 2026-09-02 转正）。source 态（窗口化文本）不变。

**背景（取证）：** `PreviewTab` 显式以 chrome=false 渲染（注释「block cards are a transcript affordance (ticket 16)」）；操作者痛点 6。块级组件与块 key / 复制反馈机制票 16 已交付，本票是范围扩展非新造。

**Blocked by:** 31（PreviewTab 多实例化先行，避免同文件两写者）。

**Status:** ready-for-human

- [ ] 预览 rendered 态代码格 / 表格卡片与主转录同款（按钮、tooltip、反馈一致）
- [ ] source 态不变（窗口化文本不套卡片）
- [ ] 块 key 稳定性回归不破（无流式，但换行 / 复制状态隔离正确）
- [ ] visual 帧核验（预览块卡片对照转录帧）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。归类：**已豁免项转正**（票 16 范围裁定被操作者推翻）。波次：W3（PreviewTab 唯一写者）。
- 2026-09-02 (claim): wt-32-preview-chrome 实现会话开始。31 已在 main（6b2bd24），无同文件双写者。TDD seam：visual harness DOM 探针（renderer 组件无 jsdom 单测层）；块 key 稳定回归由既有 markdown-blocks 单测覆盖。
- 2026-09-02 (done): sha 43f21aa on t32-preview-chrome（勿由本会话 merge，操作者执行 `bash scripts/merge-ticket.sh 32`）。红→绿：先在 visual.ts 落 4b/4c/4d 探针（红：`preview chrome signature codeCards:0`），再开 chrome（绿）。改动：PreviewTab 用默认 chrome；Markdown 删除已无消费者的 chrome prop；preview body 面改 --bg-main（白卡片需暖底才能与转录同读感——spec 29「look and behave exactly alike」）；删 `.preview-md table` 裸表规则（滚动归 .md-table-scroll）。探针证：按钮（代码卡×2、表格×3）、tooltip（7 个 data-tip-label）、复制 ✓ 反馈与 payload、双代码卡换行/复制按键隔离、source 态零卡片、表预览弹层从预览 tab 可开。visual 帧核验：4b-preview-chrome 对照 2b-code-wrapped 同语法（含换行激活橙色 + 复制绿✓）。回归：顺手修 5b 步骤未限定 active tab 的选择器（fixture tab 常开导致截断帧拍错 tab，与 31 crumb 同形）。typecheck/lint/test 788/788 绿。
