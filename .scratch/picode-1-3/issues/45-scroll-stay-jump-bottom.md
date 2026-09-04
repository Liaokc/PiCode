# 45: 滚离保持 + 回底钮

**What to build:** 转录滚动行为两件：① **滚离保持**（Q12 行为变更）——废除现状"内容增长即强制拽底"：流式期间用户上翻阅读**保持原地**，新内容不拽人；吸底决策收敛为纯函数 `shouldAutoScroll(滚动状态, 内容增长, 是否自己发送)`——仅 nearBottom（沿用 ~160px 阈值）或**自己发送**时自动置底；② **回底钮**——滚离超过阈值时，composer 上方中央浮现圆形 ↓ 钮，点击平滑回底并恢复吸底；显隐淡入淡出。

**背景（取证）：** 现状 `if (grew || nearBottom) scrollTop = scrollHeight`（ChatView 实证）——边流式边阅读会被拽回；ZCode 回底钮为圆形（card 底 outline），`data-following` 标记吸底态（z13-jump-to-latest 对照帧）。

**Blocked by:** 44（ChatView 串行链）。

**Status:** ready-for-agent

- [ ] 流式期间滚离原地：新内容到达不拽底；nearBottom 或自发送时照旧置底
- [ ] 滚离超阈值 → 圆形 ↓ 淡入；点击平滑回底 + 恢复吸底 + 钮淡出
- [ ] shouldAutoScroll 纯函数表驱动（Seam-1 决策表：滚动状态 × 增长 × 自发送）
- [ ] electron smoke（滚离后流式增长不拽底 / 回底钮现→点击回底 / 自发送跳底）
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R9 前半，R9 整包拆二——本票为独立可验收切片，Q12 行为变更拍板）。吸底阈值沿用现状 160px。波次：W4（串行链第二棒，44 合入后开）。
