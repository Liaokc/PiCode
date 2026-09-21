# 120: 导航轨 live 锚定——吸底时锚定最新回合（含 live）

**What to build:** 导航轨锚定规则修订（`shared/navigator-rail.ts` 纯模型决策表扩展）：**视口吸底态（isAtBottom 口径，复用 scroll-stay 既有常量与判据）锚定 = 最后一个 anchor（live 回合含内）**；非吸底维持现行探针规则（`anchoredTurnId`，VIEWPORT_PROBE_FRACTION=0.35 不动——锚定跟随阅读位置）。`NavigatorRail` 组件只消费新决策；渲染词汇（scaleX 衰减/opacity 分层）零改动。导航轨仅 ChatView（票 46 口径）。`CONTEXT.md` 导航轨词条随票修订（锚定规则补吸底分支）。

**背景（取证）：** 操作者图2：最新一轮 Working · 14s 运转中，左侧 focus tick 却在倒数第二轮。根因 = 探针几何：`navigator-rail.ts:131` 探针在视口 35% 线，live 回合刚开始时用户气泡还在视口下部（Working 容器 + composer 占底部 ~25%）够不着探针线 → `anchoredTurnId`（top ≤ probeY 的最后一条）锚定留在上一轮；回合内容增长超过 35% 视口高后才自愈——14s 场景精确复现。Q2 裁决：吸底时锚定最新回合、上翻时探针规则。

**Blocked by:** 无（独立）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：锚定决策表驱动（吸底/非吸底 × live/落定 × 单回合/多回合；探针规则回归用例全保留）
- [x] electron smoke：live 回合吸底时 focus tick = 最新回合；上翻阅读时锚定跟随阅读位置
- [x] visual harness：吸底/上翻两态帧（对照 pi18-*，若操作者已复制）
- [x] 性能红线：零轮询（纯模型派生，既有纪律）
- [x] CONTEXT.md 导航轨词条修订随票入册
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P2 定稿为 R2（操作者 Round 5 复核确认在案）。Q1 同族裁决：`RAIL_MIN_TICKS = 2` 维持不变（单回合不显示符合预期；live 第二回合计入 anchors 已与 ZCode 一致——现状确认，无代码变更）。
- 2026-09-22 (implement session)：实现 = `shared/navigator-rail.ts` 新增纯决策 `railAnchoredTurnId(anchors, geometry, probeY, viewport)`——`isAtBottom(viewport)`（复用 scroll-stay 判据，distance<1，严于 160px 吸底带）→ 最后一个 anchor（live 含内）；否则现行探针规则 `anchoredTurnId`（0.35 不动）原样；`NavigatorRail.tsx` measureAnchored 改为只消费新决策（测量 geometry + ScrollSnapshot 传入，deps 增 anchors）；渲染词汇（scaleX/opacity/tone）零改动；导航轨仍仅 ChatView；RAIL_MIN_TICKS 不动。**验证链**：vitest 1977/1978（唯一失败 `tests/main/subagent-root`… 环境性预存，root main worktree 同样失败，与本票零交集）；typecheck 双 tsconfig 清；lint 新增代码零告警。electron smoke：ticket-120 新阶段（ticket-94 先例零模型调用：合成 session_created(resumed)+history_loaded 三高回合 + live 事件注入；四格矩阵 live×吸底 / live×上翻顶 / settled×上翻中位（3/4 回合间探针线确定性放置）/ settled×吸底）连续两轮全绿（run5/run6：nav_live_anchor_scene/live_bottom/live_scrolled/settled_scrolled/settled_bottom/done）。**ticket-46 阶段涟漪修复**：新规则下短转录（不溢出）恒为吸底→点击跳转无法离底，阶段③「点击后焦点跟随」断言失效；修复 = 阶段首条 prompt 改带中段空白填充（首修复尾部填充无效——Composer 发送路径 `.trim()` 剥尾；诊断实证：两回合回放+40 空行首泡，点击后 scrollTop 781→2、焦点正确落首 tick）；修复后 nav_rail 全阶段连过两轮。visual harness 新建 `visual:rail-anchor`（ra1-at-bottom-live：ticks=4、focused=最新 live 回合 m6、dist=-0.5 吸底、labels=[…,Working]、jumpVisible=false；ra2-scrolled-up：focused=首回合、scrollTop=0、jumpVisible=true；断言全过 exit 0，帧+rail-anchor.json 留档）——pi18-* 参照帧未入 compare 集，两帧独立成立。smoke 后段独立阶段非确定性失败与零码交集（run5 ticket-90 偶发、run6 过 90 挂 ticket-91；均在本票阶段之后的旧阶段、无共享代码，ticket-105 首跑失败亦为环境性 focus 偶发、次轮全过）。**双轴自评审**（主 Agent 已代验 + 本会话 fallback）：Standards 轴 = Seam-1 收敛/零新缝（visual harness 为既有基建惯例）、命名入 railAnchors 家族、无轮询/无占位/无范围膨胀、CONTEXT.md 词条单一拼写（吸底判据引用回底钮词条）；Spec 轴 = 票面 Acceptance 逐条对照全过（见上）；发现并修复 = 票 46 阶段场景假设过时（见上）、测试表内两行 geometry 与 scrollTop 投影不一致（已改各自投影）。
- 2026-09-22 (implement session 簿记)：实现提交 sha = `7d233fe`（t120-rail-anchor）；本条为后续 sha 簿记提交，分支 tip 以本提交为准。
