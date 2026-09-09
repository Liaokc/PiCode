# 50: 代码卡语言标签回退——裸围栏显示 text

**What to build:** 无语言 tag 的围栏代码块（裸 ` ``` `），代码卡左上角标签**回退显示 "text"**（ZCode 实机同型：`language?.trim() || 'text'`，标签永远在）；带语言标签的块（json/bash 等）行为零回归；卡片其余 chrome（wrap/copy）不动；**不加文件图标**（最小对齐，Q8 拍板）。

**背景（取证）：** 现状 `language !== null` 才渲染标签——裸围栏无标签（会话 01a057f5 entry#239 四框实证，截图 pi14-untagged-codeblocks）；ZCode 代码卡头部组件 `yN` 实证缺失回退 text。

**Blocked by:** None (can start immediately)。

**Status:** ready-for-human

- [x] 裸围栏卡显示 text 标签；带标签块零回归；卡片 chrome 不动、无图标
- [x] 语言回退投影纯函数表驱动（Seam-1）
- [x] visual 帧对照 pi14-untagged-codeblocks 场景入库；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R5，Q8a）。小票，纯 renderer，可与 48/49 并行。波次：W1。
- 2026-09-09 (implementation, t50-codeblock-text @ daacff2): 完成。① Seam-1 纯投影 `codeLanguageLabel`（`language?.trim() || 'text'` ZCode 同型）落 `src/shared/markdown-blocks.ts`，决策表测试 8 行（带标签零回归 / 裸围栏 / hljs-only / 空前缀 / 空白 token / 非 code / 缺节点）入 `tests/shared/markdown-blocks.test.ts`；② `CodeBlockCard` 标签芯片恒渲染（去掉 `language !== null` 条件），chrome（wrap/copy）不动、无文件图标；③ 新增 `visual:codeblock` harness（PICODE_VISUAL_CODEBLOCK=1，断言式）：流式注入 2 带标 + 2 裸围栏，探针断言标签序 ['typescript','text','json','text']、每卡恰 2 chrome 钮、标签内恰 1 图形；帧 `cb1-untagged-codeblocks.png` 对照 `.scratch/compare/pi14-untagged-codeblocks` 入库（隔离 session store + 抛弃型 userData，帧不含真实会话）。typecheck / lint（0 error，1 条 EmptyState 既有 warning）/ 全测 1032 绿。未自行 merge——操作者执行 `bash scripts/merge-ticket.sh 50`。
