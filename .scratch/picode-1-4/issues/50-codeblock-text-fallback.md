# 50: 代码卡语言标签回退——裸围栏显示 text

**What to build:** 无语言 tag 的围栏代码块（裸 ` ``` `），代码卡左上角标签**回退显示 "text"**（ZCode 实机同型：`language?.trim() || 'text'`，标签永远在）；带语言标签的块（json/bash 等）行为零回归；卡片其余 chrome（wrap/copy）不动；**不加文件图标**（最小对齐，Q8 拍板）。

**背景（取证）：** 现状 `language !== null` 才渲染标签——裸围栏无标签（会话 01a057f5 entry#239 四框实证，截图 pi14-untagged-codeblocks）；ZCode 代码卡头部组件 `yN` 实证缺失回退 text。

**Blocked by:** None (can start immediately)。

**Status:** resolved

- [x] 裸围栏卡显示 text 标签；带标签块零回归；卡片 chrome 不动、无图标
- [x] 语言回退投影纯函数表驱动（Seam-1）
- [x] visual 帧对照 pi14-untagged-codeblocks 场景入库；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R5，Q8a）。小票，纯 renderer，可与 48/49 并行。波次：W1。
- 2026-09-09 (implementation, t50-codeblock-text @ daacff2): 完成。① Seam-1 纯投影 `codeLanguageLabel`（`language?.trim() || 'text'` ZCode 同型）落 `src/shared/markdown-blocks.ts`，决策表测试 8 行（带标签零回归 / 裸围栏 / hljs-only / 空前缀 / 空白 token / 非 code / 缺节点）入 `tests/shared/markdown-blocks.test.ts`；② `CodeBlockCard` 标签芯片恒渲染（去掉 `language !== null` 条件），chrome（wrap/copy）不动、无文件图标；③ 新增 `visual:codeblock` harness（PICODE_VISUAL_CODEBLOCK=1，断言式）：流式注入 2 带标 + 2 裸围栏，探针断言标签序 ['typescript','text','json','text']、每卡恰 2 chrome 钮、标签内恰 1 图形；帧 `cb1-untagged-codeblocks.png` 对照 `.scratch/compare/pi14-untagged-codeblocks` 入库（隔离 session store + 抛弃型 userData，帧不含真实会话）。typecheck / lint（0 error，1 条 EmptyState 既有 warning）/ 全测 1032 绿。未自行 merge——操作者执行 `bash scripts/merge-ticket.sh 50`。
- 2026-09-09 (merge, T00): 合入 main —— merge sha `e5d4609`（分支重写为 `957e0c1`）。验收口径：操作者明示「50 工单已验收」。簿记前置补齐（操作者授权）：merge-gate 门槛追加 picode-1-4 目录 `7d1d6b9`；tracker 基线入库 `fcb1dbc`（基线 tag `picode-1-4-base` = 8b7bb8b，操作者创建）。冲突处置：rebase/合并零冲突（分支未触 tracker，触面仅代码 + README/package.json 各 1 行 + 新帧）。终态审计：codeLanguageLabel 投影与 4 处测试引用幸存，visual:codeblock 双注册（package.json + src/main/index.ts）幸存，新帧入库，CONTEXT.md / app.css 零改动（本票无 rider），无冲突标记残留；typecheck 绿，**1032/1032 tests 绿**（77 文件）。worktree 已清理。
