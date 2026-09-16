# 70: chip 弹层开关竞态修复——Access/Model/Thinking 再点必收

**What to build:** 权限/模型/思考三 chip 点开弹层后**再点 chip 本体必收起**（toggle 语义成立）；弹层的 document 级 mousedown 外点关闭**豁免 owning chip**——mousedown 落在打开该弹层的 chip 内则不关，交给 chip 自身 click toggle 收起；真外点仍关、弹层内点击不误关、点弹层内行选择正常。实现形态（ref 回传/事件标记/stopPropagation）由票裁量。

**背景（取证）：** 弹层挂 document 级 mousedown 外点关闭；点 chip 本体时 mousedown 先关菜单 → 重渲染 → click 落到 `menu===null` 的 toggle 分支又弹开——关了又开=「点不收」。file:line 级根因见 `../intake-grilling.md` R4 节。

**Blocked by:** 69（同菜单模块串行）.

**Status:** ready-for-human

- [x] electron smoke：三 chip 各自「开→再点本体→收」；真外点关闭；弹层内点击不误关
- [x] chip toggle 行为测试（组件测试或表驱动，由票裁量）
- [x] 纯 renderer 改动，零契约增量
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-15 (implemented, t70-chip-toggle): 外点关闭收敛为 `src/shared/composer/outside-close.ts` 的 `shouldCloseOnOutsideMousedown({popover, anchor, target})`（Seam-1 纯函数，contains 注入零 DOM）——三序规则：弹层内不关 → **owning chip 豁免**（mousedown 交还 chip 自身 click toggle）→ 其余即关；无 anchor 的文本菜单（slash/file）保持原外点关闭。`ComposerPopover` 增可选 `anchorRef`，三 chip 菜单（Access/Model/Thinking）**必填** `chipRef`（owning chip 是 chip 菜单的固有属性；ModelMenu 空目录分支同传），Composer 三个 chip button 挂 ref。新 smoke `chip_toggle` 阶段用**真按压序列**（mousedown→mouseup→click——旧 `click()` 不发 mousedown，正是竞态藏身之处）：三 chip 各自 mid-press 探针（mousedown 半程弹层必须在场）+ 完成半程必收；弹层内选中行 mousedown 不关、click 仍 pick（幂等零状态）；跨 chip（access 开→press model chip→access 关 model 开）；document.body 真外点关死后不复弹。
- 2026-09-15 (code-review 两轴)：Standards 轴——Seam-1 纪律/工单注释/全英文/渲染层不触 SDK/零契约均达标；判断级发现两条：smoke 内联 row-press IIFE 两次近似重复（可提 helper，量小未提）；smoke.ts 本票承载两事（chip_toggle 阶段 + 票 68 零匹配回合 auto-deny 加固）属 Divergent Change 边缘——加固直接服务于本票验证通路且已披露。Spec 轴——验收四项全覆盖、stories 19–22 逐条落地、无范围蔓延；一条边界如实记录：mousedown 按住拖离 chip 松开（click 不落）时弹层保持打开——定稿明文「交给 chip 自身 click toggle 收起」的自然结果（标准 dropdown 行为），非回归。
- 2026-09-15 (verification)：vitest 1364/1364 全绿（含新 outside-close 表 11 行 + 序列回放 2 测）；typecheck 双 tsconfig 干净；eslint 本票文件零新增（全仓 4 个既有告警均在未触碰文件）。electron smoke 两次全跑全绿（SMOKE done，chip_toggle 六检查点 + menu_keyboard 回归无恙）；**负验证一次**：stash 修复后渲染层重建，smoke 恰在决定性探针失败——`SMOKE FAIL the Access mode: popover closed on the mousedown half of the owning chip's press (the pre-70 race is back)`——探针确实捕获缺陷。过程中三次环境层失败已处置：ticket-44 焦点窃取被拒（操作者正活跃输入，macOS 15 限制）、empty-state 目录 5s 窗口未及 models_available（注册表慢）、零匹配回合模型幻觉调 bash 工具撞审批门（票 68 阶段加固：一次性 auto-deny `session_command deny_tool`，agent_end/host_exit 即解除武装，票 25 的门不受影响——加固运行中实捕 `menu_surface_gate_auto_deny tool=bash`）。ps 自查按验收项执行（仅 Postman/ZCode 无关进程）。**操作者：`bash scripts/merge-ticket.sh 70`。**
