# 44: 用户消息常驻复制

**What to build:** 用户输入气泡下加**常驻** Copy 按钮（Q10 拍板常驻，非悬停浮现）：样式与助手消息操作行同族；**不带 Fork**（fork 语义锚在 assistant entry）；点击复制该条输入的**原始文本**。

**背景（取证）：** 现状用户消息为纯 div（`msg-user`，无任何供面），助手回复有常驻 Copy/Fork/时间操作行——不对称（截图 pi13-newtask-after-first-msg 可见）。

**Blocked by:** None (can start immediately)。*ChatView 本批三票（44→45→46）必须串行，本票为链首。*

**Status:** ready-for-human

- [ ] 每条用户输入下常驻 Copy 钮；样式对齐助手操作行（图标 + 文案 + 反馈）
- [ ] 复制内容 = 原始文本；复制 ✓ 反馈与助手侧一致
- [ ] 无 Fork 钮；转录/Follow 既有行为零回归
- [ ] electron smoke（点击复制进剪贴板断言）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R8，Q10 常驻拍板——操作者推翻 hover 推荐）。ChatView 串行链首。波次：W3。
- 2026-09-07 (implement): 89ed46a @ t44-user-copy。用户气泡 + 常驻 Copy 行成对渲染为 `.msg-user-block`（复用 MessageActions 同族样式；`showTime={false}`——票面只要求图标+文案+反馈，不加时间戳；无 Fork）。复制内容 = 气泡文本（用户所发原文；skill 前导为应用注入故剥离，同票 42 标题口径）。electron smoke 新增 user_copy 阶段：真实聚焦 + 剪贴板哨兵替换断言（Electron 44 的 main 侧 clipboard API 已 Promise 化）+ 恰好一钮 + Copied 反馈；`npm run smoke:electron` 全绿至 done，typecheck / lint / 987 单测绿。验收帧 .scratch/visual/1-midrun.png。code-review：修复 1 处（showTime=false 时 copiedTimer 卸载清理缺口），其余两轴零发现。未自行 merge——请操作者执行 `bash scripts/merge-ticket.sh 44`。
