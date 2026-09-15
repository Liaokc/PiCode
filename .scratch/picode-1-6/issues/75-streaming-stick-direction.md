# 75: 流式吸底方向感知——滚轮永远赢

**What to build:** 流式输出期间**任何向上滚动手势立即解除吸底 pin**（对照操作者痛点：轻微上滑与流式逐帧互搏、文字剧烈抖动）；恢复吸底 = 滚回底部（既有 nearBottom 判定）/ 自己发送 / 回底钮点击；**160px 阈值语义收窄为回底钮显隐专用**（吸底判定不再用它）。scroll-stay 纯模型扩展：决策表新增 reader-held-away 输入（向上滚动手势置位、回底/自发送/跳转复位），置位期间内容增长绝不拽人——「内容增长不拽人」是票 45 立法本意，本修让带内强吸不再违背它。仅 ChatView（票 45 同界）。

**背景（取证）：** shouldAutoScroll = selfSent || (nearBottom && grew)，nearBottom = 距底 <160px；流式 delta 每帧跑 effect，带内强拽 scrollTop 到底——轻微上滑仍在带内，与滚轮逐帧互搏。file:line 级根因见 `../intake-grilling.md` R7 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent → implemented on `t75-stick-direction` @ 7b8e105 (implement session; merge via `scripts/merge-ticket.sh 75`)

- [x] Seam-1 scroll-stay 决策表扩展（heldAway 置位/复位 × nearBottom × selfSent 全组合）
- [x] electron smoke：流式中上滚立即停吸不抖；滚回底部恢复吸底；自己发送仍置底
- [x] 回底钮显隐行为不回归（160px 语义收窄后）
- [x] FollowView 不做（界外确认——票 45 同界）
- [x] 纯模型扩展零额外渲染（scroll 监听内现有路径延伸）
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）

## Comments

**Implement session（分支 t75-stick-direction @ 7b8e105）：**

- 模型：`ScrollState.heldAway` 输入 + `nextHeldAway` 纯转移（上滚离底置位；落到绝对底 = 钳制回底清位，防钉底死态；带内下滚恢复；±1px 迟滞）；stick 表全 16 组合 + 14 行转移表全绿（TDD red→green）。
- ChatView：闩 ref-only，写点全在既有 scroll 监听/effect（零额外渲染）；effect 用 live delta 复跑转移，手势与同帧拽动竞态不丢；自发送/回底钮/切会话清位。
- electron smoke `scroll75` stage 全绿：带内 60px 上滚立即停吸（delta 零位移、钮不浮现）→ 滚回底部恢复钉底 → held-away 自发送置底且回复流钉底到 agent_end。计数 1200（③ abort）——首轮 120 计数 run 太快，settle 收缩钳制 held 读者造成假失败，已修。
- 票 45 老 stage 作为不回归 harness 同绿；typecheck / 1320 单测 / lint 全绿；smoke 前 `ps` 自查（等出 wt-68 槽位）。
- **两处裁量报备**：① 「吸底判定不再用它（160px）」实现为「不再对上翻读者驱动强吸」——`nearBottom` 保留在未-held 跟随门与闩回底恢复臂（整体删除会拽走锚点跳转等非手势离底读者，违背票 45 立法本意；工单表规格本身保留 nearBottom 维度）；已写入模型头注释与 CONTEXT.md。② 钳制清位归入「回底复位」，有独立测试行。
