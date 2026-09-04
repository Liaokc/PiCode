# 41: New Task 空态模型/思考档——目录通供 + 链式默认

**What to build:** New Task / 启动空态下，Composer 的模型与思考档芯片**真实可用**：模型菜单列出可用 provider→model 目录（消费 **auth probe 的模型目录**——复用既有 `--auth-probe` 短命 host 机制与其 IPC 通道，main 层缓存，零新契约）；芯片显示**链式默认**（偏好 defaultModel/defaultThinkingLevel → Pi 兜底默认并标注 default → 全无配置才落底纹提示语）；空态所选模型/思考档进 pending 链，随 create_session 一并送达。空下拉消失。

**背景（取证）：** 现状空态 `chat = initialChatState()`，models 仅由活 host `models_available` 填充——New Task 无 host 即无目录，"Select Model ⌄/Thinking ⌄" 灰占位、点开空白条（截图 pi13-* 三帧）；auth probe 报告已含完整模型目录（`AuthProbeReport.models`，数据在、未接线）。

**Blocked by:** 38（composer 菜单与 App 接线同文件，串行规避双写者）。

**Status:** ready-for-agent

- [ ] 空态模型菜单列真实 provider/model（与发送后一致）；思考档七档可用
- [ ] 芯片显示链式默认：偏好默认 → Pi 兜底（标注 default）→ 无配置占位提示语（有底纹，非空白）
- [ ] 空态所选项随首条消息送达会话（行为与发送后选模型一致）
- [ ] 目录投影 + 链式默认决议纯函数表驱动（Seam-1：probe 报告 → 菜单形；偏好 → 生效默认）
- [ ] electron smoke（空态菜单列真实模型 + 所选项送达）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R2，grilling Q2 方案 a）。复用 auth-probe 链（票 11 先例）；目录投影同型先例 groupModelsByProvider。波次：W2。
