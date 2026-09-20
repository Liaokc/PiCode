# 94: 工作容器折叠锚定——确定性规则

**What to build:** Worked 容器折叠/展开的**确定性锚定规则**：①视口不在底部时切换——**栏头视觉锚定不动**（点击的那行永不跳，内容向下展开/向上收拢）；②吸底态切换——**保持贴底**（底不动，栏头按需上移）。ChatView 与 FollowView 同规则。消除现状浏览器默认 scroll-anchor 的不定行为（有时顶端不动有时跳）。

**背景（取证）：** `TurnContainer.tsx` 仅 onToggle 无锚定逻辑；浏览器 overflow-anchor 启发式导致观感「怪」（操作者原话：「折叠栏展开，究竟是否栏的顶端不动还是栏顶端上移，我觉得现在的交互有点怪」）；Q10 拍板双态规则。实现 = 切换前后按栏头位置差校正 scrollTop（scroll-stay 同族纯模型）。

**Blocked by:** 92（回合文件条 settled-only——同 ChatView/TurnContainer 区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：锚定位置差纯函数（切换前后 header offset → scrollTop 校正量；吸底态特例分支）表驱动
- [x] electron smoke：中段折叠/展开栏头视口位置不变（像素级断言）；吸底态切换保持贴底
- [x] FollowView 同规则；票 55/56 容器语义（零工作项 inert、live 流式展开、落定自动折叠）零回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
- 2026-09-18 (merge session，per 操作者验收指令「94 工单已验收」)：四验收框按提交证据链勾选（feat `5d4cdfd` commit message = 实现与验证记录：fold-anchor 纯规则表驱动 + use-fold-anchor 渲染 hook + overflow-anchor:none 收编浏览器启发式 + smoke 像素断言含 FollowView 腿；refactor `3309adb` = code-review 双轴修复明细：guarded measure() / scrollRef 必填 / FollowView ② 补齐 / 点击捕获与 commit 无竞注记）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
