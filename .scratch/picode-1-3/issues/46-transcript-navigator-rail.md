# 46: 转录导航轨——用户输入 tick 束 + 预览气泡 + 平滑定位

**What to build:** 主转录左缘**导航轨**（ZCode turn navigator 同型）：每个真实用户消息（含 steer/follow-up）一根 tick；tick = 等宽基条 + **scaleX** 表达焦点/活跃衰减（focus=前景色 / muted=次级色；视口锚定 query 加亮、运行中不低于 0.72 透明度）；hover 右弹**双段预览气泡**（用户输入 clamp 2 行 + 助手回复摘要 clamp 3 行，短延迟开合）；点击 **smooth 平滑定位**到该用户消息（DOM 直查优先，未挂载 rAF 兜底等挂载）；tick 列垂直居中、可独立滚动（滚轮滚 tick 列不滚转录）；tick < 2 整轨不渲染；窗口宽低于阈值（ZCode 校准 864px）不显示；轨显隐 opacity/位移过渡。仅 ChatView，FollowView 不做（Q7④）。上下移动时气泡跟随丝滑（淡入淡出 + 微位移）。

**背景（取证）：** ZCode turn navigator 实机行为参数（只读取证）：轨区 ~48px 触区 / tick 列 ~36px / tick 等宽 scaleX（截图证据：多根 tick 同屏长短不一）/ 气泡 clamp2+clamp3 / smooth + rAF 兜底 / <2 隐藏 / 864px 阈值；对照帧 z13-navigator-rail / z13-navigator-hover。

**Blocked by:** 45（ChatView 串行链——依赖其吸底决策与滚离态）。

**Status:** resolved

- [ ] 左缘轨：每真实用户输入一根 tick；等宽基条 + scaleX 焦点/活跃衰减；锚定加亮
- [ ] hover 气泡：用户输入 + 助手回复双段预览（clamp 2/3），右弹、短延迟开合
- [ ] 点击 smooth 平滑定位该用户消息（含虚拟/未挂载兜底）；移动气泡跟随丝滑
- [ ] tick < 2 不渲染；窗口过窄不显示；轨显隐过渡；tick 列独立滚动不牵动转录
- [ ] 导航轨纯模型表驱动（Seam-1：锚点分数位、tick 显隐规则）
- [ ] electron smoke（点击定位断言 / 气泡出现断言）；visual 三帧对照 z13（轨/气泡/滚离态）；性能红线：hover/点击零重渲染风暴（票 30 memo 基建）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R9 后半，1.3 收官票）。ZCode 参数取证详见 ../intake-grilling.md。波次：W5（串行链末棒，1.3 收官）。
- 2026-09-08 (implementation): 已实现并提交 **7bfddba**（分支 t46-navigator-rail，未自行 merge——请操作者执行 `bash scripts/merge-ticket.sh 46`）。落点：Seam-1 纯模型 `src/shared/navigator-rail.ts`（锚点分数表 + tick 显隐规则，17 vitest 表驱动用例）；`NavigatorRail.tsx`（rAF 节流锚定、双段预览气泡 120/80ms、smooth 定位 + 12 帧 rAF 兜底、tick 列独立滚动）；ChatView `.chat-body` 包裹 + `data-turn-id`；electron smoke 七断言（<2 隐藏 / 两 tick 出现 / 气泡开合 / 点击定位 + 锚定加亮 / <864px 隐藏——minWidth 1040 够不到 864，页内 shadow innerWidth 验证机制）；visual 三帧入库 `.scratch/compare/t46-nav-{rail,hover,scrollaway}.png`；CONTEXT.md 落「导航轨（Turn Navigator）」词条（回底钮票 45 已入账）。性能红线：轨自持 hover/锚定状态、tick 行 memo、同值 setState bail——hover/点击零转录重渲染。code-review 两轴通过（Standards：修剪未用几何常量、pollOpacity 提取去重；Spec：12/12 检查点落地）；审查途中发现并修复 nav ref 丢失导致气泡定位在 0 的真实缺陷。typecheck / lint / test 1024 全绿，smoke 全链 no orphans。
- 2026-09-08 (merge): merged as **14d5fcc**（--no-ff，36 文件 +1183/−43，实现 7bfddba 单提交重放，分支 sync 提交判重丢弃——46 会话自行做了与簿记同构的 sync，流程完全合规）。验收口径：操作者目检后明说「已验收」。冲突处置：**零冲突**（零代差，ChatView 链末写者无碰撞——44/45/46 三写各自区段）。main 终态审计：typecheck + vitest **1024/1024**（76 文件，+17）；navigator-rail 纯模型（164 行）+ 243 行套件 + NavigatorRail 组件三件套在位；visual 三帧（9-nav-rail / 9b-nav-hover / 9c-nav-scrollaway）+ compare 三副本（t46-nav-*）入库；ChatView 三写共存（msg-user-block / chat-jump-btn / NavigatorRail ×4 引用）；**全批八套纯函数齐**；无冲突标记。**11/11 COMPLETE**。
