# 62: 导航轨层叠修复——主区自构成层叠上下文

**What to build:** 侧栏会话行的右键菜单（z:80）打开时**完整可见**，不再被主区导航轨的 tick 束穿透覆盖。修法 = chat 主区自构成层叠上下文（isolation / 等效 z-index 方案），使导航轨的 z 值在主区子树内参与比较而非直达根上下文；侧栏子树整体恢复高于轨道。轨道、悬停预览气泡、回底钮在主区内的行为零回归。

**背景（取证）：** 层叠上下文陷阱——`.sidebar` z-index:1（为压空态水印）构成上下文，右键菜单 z:80 **被困侧栏子树**；`.chat-body` 仅 position:relative 无 z-index 不构成上下文 → `.nav-rail` z:5 **直达根上下文**；5 > 1 → 整轨盖住整个侧栏（pi15-rail-over-context-menu）。被拒：菜单 portal 到 body（改动更大、引入定位新复杂度——Q9 拍板 A）。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 右键菜单打开时九项完整可见、可点击，无 tick 穿透（对照 pi15-rail-over-context-menu 场景）
- [x] 主区子树整体压侧栏之下不引入新回归：轨道悬停气泡、回底钮（z:10）、根层 tooltip / 各浮层行为不变
- [x] visual harness：菜单压轨帧（修复后形态，对照 pi15-rail-over-context-menu）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 62`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R6，Q9=A）。波次 W1。纯 CSS 级小票（缺陷，票 46 交付即有——层叠上下文未在当时暴露）。
- 2026-09-11 (implementation, t62-rail-stacking-fix @ cfd22f8): **修法取「等效 z-index 方案」而非字面 chat-body isolation**——取证发现 `.md-table-preview-backdrop`（z:90、fixed、全屏灯箱）在 Markdown.tsx 原位渲染于 chat-body 内：若对 chat-body 加 isolation，灯箱被困侧栏之下（titlebar/侧栏穿透），违反「各浮层行为不变」。z 阶梯全查：根上下文无任何元素 z 值落在 0–5 区间 → 拆掉 `.nav-rail` 的 z:5（降入 positioned/auto 带）+ `isolation: isolate`（保轨内悬停气泡不外泄）恰好只改变「轨道 ↔ 侧栏子树」这一对比较，其余全部浮层两两关系不变。导航轨区段内改动（不碰 58 输入区段）。**验收证据**：新增 `npm run visual:rail-stack`（PICODE_VISUAL_RAIL_STACK=1，`src/main/visual-rail-stack.ts`）——修复前 RED（九项在 menu∩rail 交点全部输给 tick 束，复现 pi15 帧），修复后 GREEN（九项按 ZCode 序完整、逐项 elementFromPoint 可点、交点全部菜单胜出）；回归面同 harness 钉死：tick 仍压转录、悬停气泡淡入（rs2 帧）、回底钮 z:10 淡入可命中（rs3 帧）；对照帧归档 `.scratch/compare/t62-menu-over-rail.png`。跑 visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程。typecheck / lint（0 error，EmptyState.tsx 1 条既有 warning 非本票文件）/ vitest 81 文件 1134 用例全绿。code-review 双轴：Standards 0 硬违规（1 判断项：harness 自含 helper 复制，10+ 既有 harness 同型先例）；Spec 0 缺失 0 蔓延（等效方案偏离已如上记录）。**交接：不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 62`。**
- 2026-09-11 (merge, T00 合并会话): **merged as 2981d1f**（merge --no-ff；分支 rebase 后 feat=cfd22f8'，tracker 提交 0f24c9a 自动去重）。
  - **验收口径**：操作者 2026-09-11 明示「62 已验收」；脚本门禁 typecheck 绿 + vitest **1137/1137（81 文件）**（纯 CSS + harness 票，基线未变，与分支侧一致）。
  - **worktree 甄别**：发现 10 个 skill 符号链接目录呈删除态（.claude/skills/*、.pi/skills/*）——系操作者已在 main 落库的同款清理（fab5e4d，AionUi 注入符号链接移除）在旧基点 worktree 里的镜像残留，非本票产物；git restore 恢复后 worktree 干净，rebase 平滑吸收 main 的删除。
  - **冲突处置**：**零冲突**。app.css 层叠段（.nav-rail）与 59 的图卡样式区（+140 行）不同区段自动合并——波次表「58 输入区段与 62 层叠段区段不相交」预判应验；58 的 44px padding 零波及。
  - **终态审计**：等效 z-index 方案在位（.nav-rail 拆 z:5 降入 auto 带 + isolation: isolate L4415）；rs 守卫 + visual:rail-stack 脚本 + visual-rail-stack.ts harness 在位；对照帧 t62-menu-over-rail.png 归档；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删。62 无下游票。
