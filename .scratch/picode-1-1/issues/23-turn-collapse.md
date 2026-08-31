# 23: 回合折叠——Working · Ns 整回合容器

**What to build:** 落定回合采用 ZCode 式整回合折叠：**每回合独立一行**「Working · Ns ›」，点开才露出该回合的思考行/工具卡序列；live 流式期间保持展开实时滚动，落定后自动收起；**错误回合（turn_error）保持展开不收起**；展开状态**不跨切换记忆**——切走再回/resume 一律全收起。折叠行内含**技能标记行**：嗅探触发回合用户消息中的 `<skill name="…">` 注入标记，渲染「技能 X」标记行（Pi 无结构化技能事件，不做更多解析）。当前 PiCode 逐行平铺是操作者痛点 2 的真正根源。

**背景（取证）：** ZCode 实拍 `.scratch/compare/z-turn-collapse-expanded.png`（展开态：思考行/技能行）与 `/tmp/cur.png`（默认收起态）；Pi 无 Skill 工具，grilling R2-Q2 选 B 方案（文本嗅探标记行）。

**Blocked by:** 14（折叠容器覆盖回放的结构化条目，需其载荷先行）。

**Status:** ready-for-human

- [ ] 每回合独立一行「Working · Ns ›」；落定默认收起；live 流式展开实时滚动、落定自动收起
- [ ] 错误回合保持展开；展开态不跨切换记忆（resume 全收起）
- [ ] 折叠行内渲染技能标记行（`<skill name>` 嗅探；无标记不渲染）
- [ ] 回放回合同样折叠（与票 14 的结构化条目协同）
- [ ] reducer 表驱动测试（回合边界 / 收起 / 错误例外 / 记忆规则，Seam-1）
- [ ] visual harness 更新（对照 ZCode 展开态与收起态）；`npm run smoke` ALL GREEN；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 14 拆出（grilling R2-Q1/Q2 定稿行为；取证 `z-turn-collapse-expanded.png`）。
- 2026-08-31 (implement session, t23-turn-collapse): **rebase onto main (6d022a5→f626da3, 票 16 已并) 完成，语义冲突自行整合**：(1) ChatView——fork 重新接回 turn 架构：`TurnAnswerPart` 新增 `entryId`，AnswerBlock 的 MessageActions 以回合**最后一个文本条目**为 fork 锚点（保整回合在分支路径上）+ onFork 透传，票 16 交付不回退；(2) visual.ts——保留 16 的 chrome 探针套件（1b 流式块/2b wrap/2c 表预览/2d fork toast），按折叠语义重排：落定折叠断言 → 开容器 → chrome 探针 → 密度检查；另修 review-deeplink 阶段的非确定性（现需工作区有变更：harness 自置自删 untracked 探针文件，不再依赖操作者 git 状态）；(3) 受影响证据帧全部重拍入库（20 帧，含 16 的 2b/2c/2d）。验证：vitest **524/524**（含 16 的 markdown-blocks + 新增 fork 锚点表驱动测试）、typecheck/lint 全绿、`npm run smoke` ALL GREEN（6 阶段）、visual harness 全探针通过。Status 保持 ready-for-human。
- 2026-08-31 (implement session, t23-turn-collapse): 已实现并提交 **c13df16**，未自行 merge —— 请操作者运行 `bash scripts/merge-ticket.sh 23`。要点：`src/shared/turn-collapse.ts` 纯分组（回合边界=用户消息；work=思考/工具/审批，answer=文本在外）；折叠状态机入 chat-reducer（`expandedTurns`/`erroredTurns` + `toggle_turn_expanded` UI 动作，Seam-1 表驱动 22 测试：边界/收起/错误例外/记忆/手动开合）；live 展开→落定自动收起（Working→Worked，秒数冻结；回放回合无时长优雅降级同票 14 先例）；`turn_error` 保持展开、host_exit 照常收起（banner 讲失败故事）；history_loaded/session_created 清空记忆（resume 全收起）；技能标记行（WandIcon「Skill X」）+ 用户气泡剥离 `<skill>` 注入前言（ZCode 干净气泡取证）；审批药丸在容器内且 pending 强制展开（门永不藏起）。验证：vitest 508 全绿、typecheck/lint 全绿、`npm run smoke` ALL GREEN（6 阶段；resume 阶段新增折叠门：先断言容器全收起→展开→行级断言）；visual harness 更新（1-midrun 展开/2-settled 收起/3-expanded/3b 回放全收起/3c 展开含技能行，对照 `.scratch/compare/z-turn-collapse-expanded.png` 与 `/tmp/cur.png` 通过）。code-review 双轴：0 硬违规；4 条判断项（气泡剥离前言、Working/Worked 措辞依 ZCode 实拍、流式中手动收起生效、host_exit 收起）供验收复核。
