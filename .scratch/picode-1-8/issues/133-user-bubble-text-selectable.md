# 133: 用户泡文本可选——文本段放开 user-select

**What to build:** 用户泡**文本段**放开文本选择——`.user-bubble-text`（或等价文本段选择器）增 `user-select: text`，与 `.msg-assistant`（`app.css:4341`）同规则；**技能角标段、图片缩略图、动作行不放开**（渲染件非文本）；FollowView 同规；Copy 语义不变（整条拷用户原话——选择是部分拷贝的补充不是替代）；选择起点在文本段、不破坏缩略图钮与 Edit 行交互。

**背景（取证）：** 操作者：「我发现我的发送的文字没法用鼠标拖拽去选中其中某些文字，这种对我来说不好复制啊」。根因 = `app.css:74` `body{user-select:none}`（全应用禁选）+ `:4341` `.msg-assistant{user-select:text}`（助手文本显式放开）——**用户泡从未放开**（`.msg-user`/`.user-bubble-text` 无规则继承 none），不对称是遗漏非设计。机制唯一，免问定稿。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：泡文本段拖拽选择成功（selection 非空）；技能角标段/缩略图拖拽不产生文本选区；Copy 动作语义不变（拷用户原话全量）
- [ ] FollowView 同规则断言
- [ ] 视觉零变化（纯 user-select 属性——visual 帧不要求，typecheck + 既有转录帧不回归即可）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P27 定稿为 R20（Round 5 报入）。根因 file:line：app.css:74 × :4341 的不对称缺口。
