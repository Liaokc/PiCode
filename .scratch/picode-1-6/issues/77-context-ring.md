# 77: 上下文圆环——模型 chip 左侧 ring + hover 弹卡

**What to build:** composer 模型 chip 左侧新增**上下文圆环**（形态对照 pi16-context-ring）：占用 = 最近一条 assistant message usage（**input + cacheRead + cacheWrite + output 全计入**）÷ 当前模型 contextWindow；hover 弹**数据弹层**（非 Tooltip 组件，对照 pi16-context-ring-hover）：百分比 + used/limit tokens + IN/OUT/cacheRead/cacheWrite 四元组 + 缓存命中率（cacheRead/(input+cacheRead)）；无 assistant 消息/无 usage 显**灰环**、无 hover；compaction 后自然取最新 usage（纯投影零特判）；**ZCode 分类分解不做**（消息/系统工具/技能等占比——会话文件无此记账，数据源如实原则）；仅 ChatView（FollowView / New Task 不做——回底钮先例）。**additive 契约增量**：模型引用增 `contextWindow?` 字段（模型目录载荷携带，host 从 pi-ai Model 读）；实施期**与 Pi TUI 同场景校准分子口径**并留档 ticket comment。

**背景（取证）：** PiCode 无此供面。usage 四元组在会话文件（ADR-0002 ✓）；contextWindow 不在契约（pi-ai Model 字段，models.md:207）；ZCode 分类分解为 ZCode 内部记账不可得。取证据见 `../intake-grilling.md` R5 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Seam-1 圆环投影（usage→百分比/命中率/灰环降级/无 usage 态）
- [ ] host-contract smoke：`contextWindow` additive 增量（旧载荷缺字段照常通过）+ **实施时报备入账**
- [ ] electron smoke：种子 usage 渲染环 + hover 弹卡内容齐全
- [ ] visual harness：环帧 + hover 帧（对照 pi16-context-ring / pi16-context-ring-hover）
- [ ] 与 Pi TUI 同场景分子口径校准记录（ticket comment 留档）
- [ ] FollowView / New Task 不显（界外确认）
- [ ] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
