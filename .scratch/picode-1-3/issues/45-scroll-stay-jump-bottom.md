# 45: 滚离保持 + 回底钮

**What to build:** 转录滚动行为两件：① **滚离保持**（Q12 行为变更）——废除现状"内容增长即强制拽底"：流式期间用户上翻阅读**保持原地**，新内容不拽人；吸底决策收敛为纯函数 `shouldAutoScroll(滚动状态, 内容增长, 是否自己发送)`——仅 nearBottom（沿用 ~160px 阈值）或**自己发送**时自动置底；② **回底钮**——滚离超过阈值时，composer 上方中央浮现圆形 ↓ 钮，点击平滑回底并恢复吸底；显隐淡入淡出。

**背景（取证）：** 现状 `if (grew || nearBottom) scrollTop = scrollHeight`（ChatView 实证）——边流式边阅读会被拽回；ZCode 回底钮为圆形（card 底 outline），`data-following` 标记吸底态（z13-jump-to-latest 对照帧）。

**Blocked by:** 44（ChatView 串行链）。

**Status:** resolved

- [x] 流式期间滚离原地：新内容到达不拽底；nearBottom 或自发送时照旧置底
- [x] 滚离超阈值 → 圆形 ↓ 淡入；点击平滑回底 + 恢复吸底 + 钮淡出
- [x] shouldAutoScroll 纯函数表驱动（Seam-1 决策表：滚动状态 × 增长 × 自发送）
- [x] electron smoke（滚离后流式增长不拽底 / 回底钮现→点击回底 / 自发送跳底）
- [x] typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R9 前半，R9 整包拆二——本票为独立可验收切片，Q12 行为变更拍板）。吸底阈值沿用现状 160px。波次：W4（串行链第二棒，44 合入后开）。
- 2026-09-07 (implementation): 完成于 t45-scroll-stay，feat 0222e81 + review polish 9761add + visual 帧 8e6e12b。① `shouldAutoScroll(ScrollState, ContentGrowth, selfSent)` 纯函数落 `src/shared/scroll-stay.ts`，Seam-1 八行决策表（tests/shared/scroll-stay.test.ts）；Q12 生效：滚离 + 增长不拽底；nearBottom 沿用 160px，自发送（send/steer/follow-up 三路 sendPin）置底。② 回底钮 `.chat-jump-btn` 圆形 outline（card 底）于 composer 上方中央，opacity 160ms 淡入淡出 + reduced-motion 直切；点击 smooth 回底，travel pin 保证中途增长仍吸底、用户上滚即中断。③ 新聚焦/新建会话 arrival pin 落底（resume 两拍均强制置底，保留现状开话即落底）。electron smoke 新增 scroll_stay 段三断言全绿（fresh session 构造性在 ChatView——sidebar row 点击遇 fresh mtime 会走 Live Follow，其视图共用 .chat-scroll 却无 composer，调试中实证的坑）；typecheck / lint / test 1007 全绿；CONTEXT.md 落「回底钮（Jump to Latest）」词条。**截图**：`.scratch/visual/2e-jump-to-latest.png`（滚离态 + 钮淡入，harness 新帧，probe 断言类在 + opacity 落定；拍摄中发现 harness 后台窗口节流会冻结合成器过渡——opacity 卡 0，已给 harness 窗口关 backgroundThrottling，真实 app 无此问题）。滚离态 z13 对照帧按票 46 验收归口（visual 三帧在 46）。边界守住：未做 tick 轨、未做锚点定位（留 46），FollowView 未动。
- 2026-09-07 (merge): merged as **1302015**（--no-ff，31 文件 +462/−11，四提交重放：0222e81 实现 + 9761add review 打磨 + 2dbaacb visual 帧）。验收口径：操作者目检后明说「已验收」。冲突处置：票文件评论历史对撞 ×1（分支中间版 vs 簿记 sync 的终版，终版含 2e 帧段 + harness throttle 处置记录），例行取 HEAD 侧，该提交判空跳过；零代码冲突（会话自行 rebase 到 5eba37c，零代差）。**证据处置**：新帧 2e-jump-to-latest 入库；23 张既有帧重拍（ChatView 链票功能面贯穿、无更近覆盖重拍）→ 全部入库 ✓。main 终态审计：typecheck + vitest **1007/1007**（75 文件，+5）；scroll-stay 纯函数 + 八行决策表套件在位；.chat-jump-btn（ChatView + app.css ×4）在位；CONTEXT「回底钮（Jump to Latest）」词条在位；七套纯函数全幸存；44 的 .msg-user-block 完好（链内叠加无互蚀）；无冲突标记。解锁：**46**（转录导航轨，W5，末票）。
