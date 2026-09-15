# 79: 编辑重发——用户消息 Edit → 移叶预填 → 原位分叉

**What to build:** 落定用户消息 hover 尾部出「**Edit**」钮（全英文）→ 复用既有 navigate_tree **移叶到该消息父 entry**（同文件无损、天然 No summary）+ composer **预填原文 + 原图片**（图片从用户消息条目的图片部件还原为 composer 附件态——操作者拍板图片也回填；会话文件用户消息原生内联 base64 ImageContent，还原直读）+ 聚焦 → 发送走既有 prompt 路径（SDK 原位分叉新分支——Pi sessions.md "edit and resubmit, creating a new branch" 原生语义）；**无确认框**；发送后轻 toast（票 66 fork-toast 先例）；**旧分支全保留**（树面板可达）。显隐规则：agentRunning 时隐藏；**用户点 Stop 后 agent_end 落地即复现（验收写死——不得停留隐藏态）**；可编辑对象 = 全部落定 user 消息（含 steer/follow-up 注入的）；composer 有未发送草稿时点 Edit 直接替换。**additive 投影增量**：用户转录条目携带图片部件（现投影只留文本——实施时报备入账；缺席 = 无图消息照常）。

**背景（取证）：** 机制底座已有（navigate_tree + TreePanel + 票 66 fork）；缺「编辑重发」入口。Pi 原生语义 sessions.md:108 + 分支摘要选项 "no summary"。图片存储形态 session-format.md ImageContent（base64 内联于用户消息 content）。Q9 + 操作者补充（Stop 后必须复现，已验证 agent_end 链路）+ 图片回填拍板（spec Comments 2026-09-14）。证据见 `../intake-grilling.md` R11 节。

**Blocked by:** 78（两票同改转录投影与行渲染区段——弱邻接转显式串行）.

**Status:** ready-for-agent

- [ ] Seam-1 用户条目图片还原投影（有图/无图/多图 → 附件态）
- [ ] host-contract smoke：用户条目图片投影 additive（旧载荷兼容）+ **实施时报备入账**
- [ ] electron smoke：hover Edit → 预填（含带图消息附件还原）→ 发送 → 新分支 + toast + 树面板旧分支可达
- [ ] agentRunning 隐藏；**点 Stop 后 agent_end 落地按钮即回**（显式验收）
- [ ] steer/follow-up 落定消息可编辑；草稿在位时点 Edit 直接替换
- [ ] 分支无损（旧分支回看不丢数据）
- [ ] 术语 rider：「编辑重发（Edit & Resend）」入 CONTEXT.md
- [ ] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
