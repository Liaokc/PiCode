# 133: 用户泡文本可选——文本段放开 user-select

**What to build:** 用户泡**文本段**放开文本选择——`.user-bubble-text`（或等价文本段选择器）增 `user-select: text`，与 `.msg-assistant`（`app.css:4341`）同规则；**技能角标段、图片缩略图、动作行不放开**（渲染件非文本）；FollowView 同规；Copy 语义不变（整条拷用户原话——选择是部分拷贝的补充不是替代）；选择起点在文本段、不破坏缩略图钮与 Edit 行交互。

**背景（取证）：** 操作者：「我发现我的发送的文字没法用鼠标拖拽去选中其中某些文字，这种对我来说不好复制啊」。根因 = `app.css:74` `body{user-select:none}`（全应用禁选）+ `:4341` `.msg-assistant{user-select:text}`（助手文本显式放开）——**用户泡从未放开**（`.msg-user`/`.user-bubble-text` 无规则继承 none），不对称是遗漏非设计。机制唯一，免问定稿。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：泡文本段拖拽选择成功（selection 非空）；技能角标段/缩略图拖拽不产生文本选区；Copy 动作语义不变（拷用户原话全量）——行为腿全绿；Copy 剪贴板腿环境受阻（锁屏），见 Comments 披露
- [x] FollowView 同规则断言
- [x] 视觉零变化（visual:transcript 全套 exit 正常闭环；typecheck 双绿）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P27 定稿为 R20（Round 5 报入）。根因 file:line：app.css:74 × :4341 的不对称缺口。
- 2026-09-22 (implementer claimed)：开工；work-notes/t133-progress.md 跟踪。
- 2026-09-22 (implementer done, self-review)：分支 t133-bubble-select，实现提交 `672411c`（本注释提交随其后）。要点：
  - **实现**：`.user-bubble-text { user-select: text }` 单点规则（app.css 组合泡段，与 `.msg-assistant` 同规）；技能角标段/缩略图条/动作行无规则、继续继承 body none（UserBubble 是 ChatView/FollowView/SubagentChatTab 三视图唯一泡渲染件，一条规则全覆盖，FollowView 同规自动成立）。
  - **smoke stage（ticket-133，终位 = thinking_memory 后、Quit 前）五腿**：①真拖拽（sendInputEvent mouseDown→插值 mouseMove→mouseUp，t81 先例）选中文本段——断言非空 + 锚点/焦点均在段内 + 严格部分子串（58/177 字符）；②技能行/动作行/缩略图拖拽零选区 + 拖离缩略图不误触开预览 + 真按压仍开 t91 预览浮层（Esc 关闭）；③Edit 行仍预填 composer 原文+图（t79 流）；④FollowView 同拖拽断言（59/177；fresh mtime 种子文件 → 侧栏行点击进 Live Follow，t94 先例；Stop following 归还焦点）；⑤Copy 腿：有活选区时点击仍断言剪贴板收到整条原话（u1 行 177 字全文 vs 58 字选区），焦点门 5×15s 重试（t98 trustedUntil 形）。
  - **证据链**：行为腿全绿 ×2 次独立跑（取证位与终位同代码）；vitest 2020/2020；typecheck 双 tsconfig 清；eslint smoke.ts 零告警；visual:transcript 全套 exit 正常（既有转录帧零回归——纯 user-select 属性无视觉影响）。
  - **Copy 剪贴板腿环境受阻（如实披露）**：操作者锁屏期间（lsappinfo front=loginwindow）macOS 拒绝一切 focus steal；裸 electron 探针 6 次实证锁屏/无焦点 renderer 的 navigator.clipboard.writeText 永不 settle——物理不可跑，非代码问题。Copy 语义不受本票影响（纯 user-select 属性，Copy 路径零 diff；套件既有 t44/t115 stage 覆盖 Copy 主路径，昨晚 t115/t123 全套过 t44）；stage 焦点重试门已就位，解锁后任意全套 smoke 即覆盖此腿。
  - **stage 加固披露**：腿序重排（无焦点腿先行——锁屏跑也能取证行为腿）+ workspace hand-back（开工前捕获聚焦行、跑完归还）+ 焦点门重试形（t47/t98 韧性先例）。
  - **取证手法披露（t129 先例）**：因 t44 段锁屏阻死套件，stage 曾临时前移至 t44 前取证（行为腿全绿后已复原终位，逐字节一致）。
  - **serialization 险情自报**：第 1 跑与 t130 smoke 并发（自查 pattern 缺陷——`electron\.|PICODE|electron-smoke` 匹配不到 `npm run smoke:electron` 包装进程；已改任务原版宽 pattern `[e]lectron|PICODE` 并守道至空闲）。
  - **Self-review（双轴）**：Standards 轴——CSS 单点规则 + 文件既有注释体例；smoke 遵循各既有先例形状（t97 种子/t81 拖拽/t44 剪贴板/t94 follow/t98 重试）；命名 133 后缀一贯；无 TODO/占位；UI 文案零改动。Spec 轴——验收逐条对照如上；技能段/缩略图/动作行不放开有显式负断言；Copy/Edit/缩略图交互不破坏有显式断言。
- 2026-09-22 (fix round, 双轴评审)：Standards pass-with-notes；Spec pass-with-notes 含 1 必改，均已处置（fix 提交 `988c05e`）：
  - **必改（spec 发现 3c，已修）**：腿⑤ Copy 剪贴板断言常数错位——腿③ Edit 已 navigate_tree 移走 u2，腿④ 后自断言仅剩 1 个 user block，腿⑤ 点击的是 u1 行，u1 的 Copy payload=turn.userText=stripSkillPrologue=DRAG_TEXT_133（177 字全文）；原断言 COPY_TEXT_133 解锁后实跑必失败，与票面「u1 行 177 字全文 vs 58 字选区」意图自相矛盾。修复：smoke.ts 两处 COPY_TEXT_133 → DRAG_TEXT_133；腿③ Edit 预填断言的 COPY_TEXT_133 保持不动（编辑对象是 u2）。typecheck + eslint + vitest 2020/2020 复绿；electron smoke 按指令未跑（锁屏未变）。
  - **Standards LOW（留档未抽）**：腿①④断言序列可抽 assertPartialSelection133 助手——修复轮最小变更纪律不抽；且两腿失败诊断粒度本就不同（①三分 vs ④合并），抽取会改诊断消息形状。
