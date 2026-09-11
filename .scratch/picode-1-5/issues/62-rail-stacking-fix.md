# 62: 导航轨层叠修复——主区自构成层叠上下文

**What to build:** 侧栏会话行的右键菜单（z:80）打开时**完整可见**，不再被主区导航轨的 tick 束穿透覆盖。修法 = chat 主区自构成层叠上下文（isolation / 等效 z-index 方案），使导航轨的 z 值在主区子树内参与比较而非直达根上下文；侧栏子树整体恢复高于轨道。轨道、悬停预览气泡、回底钮在主区内的行为零回归。

**背景（取证）：** 层叠上下文陷阱——`.sidebar` z-index:1（为压空态水印）构成上下文，右键菜单 z:80 **被困侧栏子树**；`.chat-body` 仅 position:relative 无 z-index 不构成上下文 → `.nav-rail` z:5 **直达根上下文**；5 > 1 → 整轨盖住整个侧栏（pi15-rail-over-context-menu）。被拒：菜单 portal 到 body（改动更大、引入定位新复杂度——Q9 拍板 A）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 右键菜单打开时九项完整可见、可点击，无 tick 穿透（对照 pi15-rail-over-context-menu 场景）
- [ ] 主区子树整体压侧栏之下不引入新回归：轨道悬停气泡、回底钮（z:10）、根层 tooltip / 各浮层行为不变
- [ ] visual harness：菜单压轨帧（修复后形态，对照 pi15-rail-over-context-menu）
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 62`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R6，Q9=A）。波次 W1。纯 CSS 级小票（缺陷，票 46 交付即有——层叠上下文未在当时暴露）。
