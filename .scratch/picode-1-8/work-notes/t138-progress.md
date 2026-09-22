# t138 progress — cascade 终验重修（两列真分离 + 选择卡贴触发钮）

唯一入口：重读本文件 + 票面 `.scratch/picode-1-8/issues/138-cascade-zcode-rework.md`。
分支 `t138-cascade-rework`，基线 main@aaed3d6。

## 参照帧取证（已读，实施前提已满足）

- `reference/z19-menu-1.png`：两列各自独立圆角卡（像素取证：左列卡 x≈135..315 top y=77 bottom≈261；右列卡 x≈322..511 top y=82 bottom≈263；两卡间 ≈6px 阴影缝隙 x316..321）。卡底紧贴 chip 上缘（chip top≈263，卡底 261，缝 ≈2px）；卡左缘 ≈ chip 左缘（≈135）。右列顶（82）≈ 被悬停行（Bella，首行）顶。
- `reference/z19-menu-2.png`：左列卡 y 52..236，右列卡 y 91..260+（右伸出截图缘）——**右列顶=被悬停行（Bella-lkc，高亮 90..121）的顶**；两卡不同高、不同纵位，构图=悬停行对齐的级联子菜单。
- `reference/pi19-menu-current.png`：现状缺陷实锤——两列连体（.cmp-popover 一个边界 + .cmp-cascade-col[1] absolute inset + border-left），且卡悬浮在输入栏上方（bottom:calc(100%+8px) 锚 composer 顶）。

## 实施方案（按帧，最小改动）

1. `menus.tsx` ComposerPopover：align='chip' 的 x 自校正转向扩展出 y 转向——目标=卡底贴 chip 顶（缝 2px，z19 实测）；基线 CSS `.cmp-popover-chip{bottom:0}` 使 computed bottom 为有限 px（delta 法免疫包含块）。x 钳制宽度改为「级联全跨距」（.cmp-cascade-models 悬在 wrapper 外，须计入，否则窄窗钳制破窗）。
2. `menus.tsx` ModelMenu：cascade 改两张独立卡——wrapper（.cmp-popover-cascade）剥 chrome 只做定位；provider 卡流内（宽 190、帽 320 内滚）；model 卡 absolute（left:196=190+6 缝，top=被悬停 provider 行顶，逐渲染测量行 rect−面板 rect；maxHeight=min(320, 视口底−8−顶)，imperative 直写免 state churn；useLayoutEffect+useEffect 双跑兜 MenuRow passive scrollIntoView 后再对齐）。
3. `app.css`：删 `.cmp-cascade-col + .cmp-cascade-col` 连体规则；新增 `.cmp-popover-cascade`（chrome 剥离）+ `.cmp-cascade-providers`/`.cmp-cascade-models` 各自 bg/border/radius/shadow。
4. smoke `menu_geometry_122` 段更新：锚点断言改为「卡缘贴 chip 缘」（cardBottom∈[chipTop−3, chipTop−1]）；加两列分离断言（两卡各有 border/radius、providers.right<models.left−3、models.top==悬停行顶、wrapper 无 chrome）；hover 稳定/键盘/窄窗腿保留（窄窗加 models 面板不出窗）。
5. visual-menu-geometry：GEOM 加 chipTop；mg2 drift 的 above→hug（chipTop−bottom）；mg3 改贴钮断言+分离断言；mg4 加 thinking 贴钮断言；帧注释对齐 z19-menu-*。

## 状态日志

- [x] Status→claimed（先落库后行动）。
- [x] 实现（menus.tsx / app.css / smoke.ts / visual-menu-geometry.ts）。
- [x] typecheck 双 project 绿；eslint（改动三文件）绿；vitest 124 files / 2175 tests 全绿（env -u 泄漏变量）。
- [x] ps 自查（2026-09-22 20:27）：无任何 PiCode dev/electron 进程（仅 Linear/Postman/Orca/ZCode 参照 app 等无关 Electron）。
- [x] visual harness mg1–mg5 全绿（exit 0）：mg1 探针实证——provider 卡 190×106 hug gap 2.0、model 卡 190×137（不同高）、groove 6.0、model top==悬停行 top、wrapper 透明、两卡各自 radius14/border1；mg2 provider 卡跨 hover 恒定；mg3/4 贴钮断言过；mg5 窄窗 819..959 ⊆ 1040。目检 mg1/mg2/mg4 对照 z19-menu-1/2：构图一致（两分离卡、右列顶贴悬停行、卡底贴 chip 上缘、左缘对齐 chip）。
- [x] electron smoke：menu_geometry_122 段（含 138 全部断言）在 3 次独立完整 run（run-1/2/4）全绿——anchor_ok（left 相等 + hug gap 2.0 + 两列分离 gap 6.0 + wrapper 透明 + model top==悬停行）、cascade_stable_ok（providers=3 跨 hover bbox 恒定）、keyboard_ok（真键 ArrowDown + 焦点停选中行）、clamp_ok（窄窗 models right 1032 ⊆ 1040）、thinking_anchor_ok（hug 2.0）；同 runs 中 menu_surface/chip_toggle/menu_keyboard（68/69/98）全绿；run-4 更通过 crash-isolation/follow/replay/newtask/multi-session 等下游段。
- [x] 全套 run-all：host-contract Round K（ticket-101 live stop 超时）连败 2 次→stash 基线 A/B 同样同位失败（预存环境故障，留档不追）；其余段单独重跑全绿（pty/usage/interop/sanitized-spawn）。electron 段因操作员活跃的 OS 焦点门连环死（t132 ×3、t105 ×2、t89 OAuth ×1、69 walk 真键重复 ×1）——均在本 diff 零交集的预存 flaky 族；本票阶段及全部键盘/焦点依赖段在可跑通的 runs 中全绿。
- [x] 票面 138 验收：①visual harness mg1–mg5 全绿+目检对照 z19-menu-1/2 构图一致；②electron smoke 锚点=chip 边（卡缘贴 chip 缘，hug 2.0±1 DOM 断言）+hover 几何稳定；③68/69/98 不回归；④vitest/typecheck 绿 + ps 自查（多次）。
- [x] code-review（self-review 双轴，主 Agent 另派独立评审）：见下节。
- [ ] 提交本分支（不自行 merge；提示 `bash scripts/merge-ticket.sh 138`）。
- [ ] 票 Status→ready-for-human + Comments 记 sha。

## Self-review（双轴）

**Standards**：eslint 三改动文件零输出（仓内 13 个预存问题均在未触碰文件）；typecheck 双 project 绿；注解均溯源票号（122/138/z19 帧）；无散布 focus()（新增仅为 imperative style 几何写）；零契约增量（shared/ 未动）；无 TODO/占位；UI 文案零改动（无新文案）。

**Spec**：验收 4 项逐条过（见上）。三个裁量披露：①model 卡顶对齐「被悬停/选中 provider 行」——票面只要求两列分离，行对齐取自 z19-menu-2 像素取证（右列顶=高亮行顶 91 vs 90..121），是帧构图的一部分；②model 卡视口下缘钳制（maxHeight=min(320, 视口底−8−顶)）——防悬出行窗外，是 122 x 钳制的竖向孪生，代码注释留档；③空目录 model 卡与 thinking 卡同走 align='chip' 贴钮路径（thinking 是票面明示；空目录是同组件一致性，非新行为面）。

## 披露与遗留

1. 全套 run-all 未取得单次端到端 ALL GREEN：阻塞全部为预存环境 flaky（Round K 已 A/B 留档；t132/t105/t44 焦点族、t89 OAuth 外开、69 walk 真键重复——操作员活跃时段 macOS 拒 focus steal/事件重复）。本票阶段+依赖段在 3 个可跑通的 runs 全绿（证据行号见 /tmp/t138-electron-run-{1,2,4}.log，已入 work-notes 摘要）。
2. menu_surface 首轮一次 "/ default-default" 假失败：同代码复跑即绿（attempt-1 全段过），且本 diff 对 slash 菜单路径行为惰性（align='left' 早退、DOM/CSS 未触及）；判环境一次性竞态，留档。
3. 帧对照结论：PiCode 新构图与 z19-menu-1/2 一致（两分离卡/不同高/各自圆角边界/右列顶贴悬停行/卡底贴 chip 上缘/左缘对齐 chip）；mg 帧已提交 .scratch/visual/ 供操作者终验目检。
