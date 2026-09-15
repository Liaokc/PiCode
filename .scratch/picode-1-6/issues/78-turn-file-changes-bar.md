# 78: 回合文件条——每回合「N files changed +X −Y」聚合

**What to build:** 每回合（groupTurns 边界）在**常显段末尾**（正文下方，构图对照 pi16-zcode-turn-filebar）渲染文件更改聚合条：折叠态「N files changed +X −Y」+ 展开箭头；展开为 per-file 行（图标 + 文件名 + 路径 + ±计数 + **Review** + **Open**）。数据 = 回合内 edit/write 工具的会话记录派生：edit 的 ± 从工具结果 diff 文本解析；write 记 **"+new"** 不计行数；**同文件多次 edit 合一行**（diff 依序拼接）；read/ls 不入条；无文件更改的回合不出条；live 随工具落定增长（live 与落定同构）。**Review** = 侧板新开**回合 diff 标签**（复用既有 diff 渲染器渲染该回合 diff 文本——回合 diff 非 git diff，与 Review tab 并存）；**Open** = 既有预览深链。**撤销钮不做**（1.1 纪律维持）；文档文件不重复渲染独立卡（既有工具卡已覆盖）。**additive 投影增量**：转录条目与 live 事件携带工具结果 diff 文本（现投影丢弃——实施时报备入账）。

**背景（取证）：** 会话库实锤——Pi edit 工具结果带 `details.diff`（+/- 行级 diff），write 结果只有字节数文本；转录投影现只留 output 文本丢 details。PiCode 现状 = 逐工具卡 + git 全仓 Review tab，无回合聚合。1.1 曾记「文件更改条+撤销 超范围仅记录」，本批操作者提报转正（撤销维持不做）。证据见 `../intake-grilling.md` R10 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Seam-1 聚合投影（edit diff 解析 / write "+new" / 同文件合并 / read 排除 / 空回合无条 / ±合计）
- [ ] host-contract smoke：diff 投影 additive 增量（旧载荷缺字段照常通过）+ **实施时报备入账**
- [ ] electron smoke：种子会话条渲染 + Review 开侧板回合 diff 标签 + Open 深链
- [ ] visual harness：折叠/展开帧（对照 pi16-zcode-turn-filebar / pi16-zcode-turn-filebar-expanded）
- [ ] 撤销不做、无更改回合不出条（界外确认）
- [ ] 术语 rider：「回合文件条（Turn File Changes）」入 CONTEXT.md
- [ ] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
