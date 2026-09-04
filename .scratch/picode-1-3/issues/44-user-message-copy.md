# 44: 用户消息常驻复制

**What to build:** 用户输入气泡下加**常驻** Copy 按钮（Q10 拍板常驻，非悬停浮现）：样式与助手消息操作行同族；**不带 Fork**（fork 语义锚在 assistant entry）；点击复制该条输入的**原始文本**。

**背景（取证）：** 现状用户消息为纯 div（`msg-user`，无任何供面），助手回复有常驻 Copy/Fork/时间操作行——不对称（截图 pi13-newtask-after-first-msg 可见）。

**Blocked by:** None (can start immediately)。*ChatView 本批三票（44→45→46）必须串行，本票为链首。*

**Status:** ready-for-agent

- [ ] 每条用户输入下常驻 Copy 钮；样式对齐助手操作行（图标 + 文案 + 反馈）
- [ ] 复制内容 = 原始文本；复制 ✓ 反馈与助手侧一致
- [ ] 无 Fork 钮；转录/Follow 既有行为零回归
- [ ] electron smoke（点击复制进剪贴板断言）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R8，Q10 常驻拍板——操作者推翻 hover 推荐）。ChatView 串行链首。波次：W3。
