# 23: 回合折叠——Working · Ns 整回合容器

**What to build:** 落定回合采用 ZCode 式整回合折叠：**每回合独立一行**「Working · Ns ›」，点开才露出该回合的思考行/工具卡序列；live 流式期间保持展开实时滚动，落定后自动收起；**错误回合（turn_error）保持展开不收起**；展开状态**不跨切换记忆**——切走再回/resume 一律全收起。折叠行内含**技能标记行**：嗅探触发回合用户消息中的 `<skill name="…">` 注入标记，渲染「技能 X」标记行（Pi 无结构化技能事件，不做更多解析）。当前 PiCode 逐行平铺是操作者痛点 2 的真正根源。

**背景（取证）：** ZCode 实拍 `.scratch/compare/z-turn-collapse-expanded.png`（展开态：思考行/技能行）与 `/tmp/cur.png`（默认收起态）；Pi 无 Skill 工具，grilling R2-Q2 选 B 方案（文本嗅探标记行）。

**Blocked by:** 14（折叠容器覆盖回放的结构化条目，需其载荷先行）。

**Status:** ready-for-agent

- [ ] 每回合独立一行「Working · Ns ›」；落定默认收起；live 流式展开实时滚动、落定自动收起
- [ ] 错误回合保持展开；展开态不跨切换记忆（resume 全收起）
- [ ] 折叠行内渲染技能标记行（`<skill name>` 嗅探；无标记不渲染）
- [ ] 回放回合同样折叠（与票 14 的结构化条目协同）
- [ ] reducer 表驱动测试（回合边界 / 收起 / 错误例外 / 记忆规则，Seam-1）
- [ ] visual harness 更新（对照 ZCode 展开态与收起态）；`npm run smoke` ALL GREEN；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 14 拆出（grilling R2-Q1/Q2 定稿行为；取证 `z-turn-collapse-expanded.png`）。
