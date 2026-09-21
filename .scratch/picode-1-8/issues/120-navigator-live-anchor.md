# 120: 导航轨 live 锚定——吸底时锚定最新回合（含 live）

**What to build:** 导航轨锚定规则修订（`shared/navigator-rail.ts` 纯模型决策表扩展）：**视口吸底态（isAtBottom 口径，复用 scroll-stay 既有常量与判据）锚定 = 最后一个 anchor（live 回合含内）**；非吸底维持现行探针规则（`anchoredTurnId`，VIEWPORT_PROBE_FRACTION=0.35 不动——锚定跟随阅读位置）。`NavigatorRail` 组件只消费新决策；渲染词汇（scaleX 衰减/opacity 分层）零改动。导航轨仅 ChatView（票 46 口径）。`CONTEXT.md` 导航轨词条随票修订（锚定规则补吸底分支）。

**背景（取证）：** 操作者图2：最新一轮 Working · 14s 运转中，左侧 focus tick 却在倒数第二轮。根因 = 探针几何：`navigator-rail.ts:131` 探针在视口 35% 线，live 回合刚开始时用户气泡还在视口下部（Working 容器 + composer 占底部 ~25%）够不着探针线 → `anchoredTurnId`（top ≤ probeY 的最后一条）锚定留在上一轮；回合内容增长超过 35% 视口高后才自愈——14s 场景精确复现。Q2 裁决：吸底时锚定最新回合、上翻时探针规则。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：锚定决策表驱动（吸底/非吸底 × live/落定 × 单回合/多回合；探针规则回归用例全保留）
- [ ] electron smoke：live 回合吸底时 focus tick = 最新回合；上翻阅读时锚定跟随阅读位置
- [ ] visual harness：吸底/上翻两态帧（对照 pi18-*，若操作者已复制）
- [ ] 性能红线：零轮询（纯模型派生，既有纪律）
- [ ] CONTEXT.md 导航轨词条修订随票入册
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P2 定稿为 R2（操作者 Round 5 复核确认在案）。Q1 同族裁决：`RAIL_MIN_TICKS = 2` 维持不变（单回合不显示符合预期；live 第二回合计入 anchors 已与 ZCode 一致——现状确认，无代码变更）。
