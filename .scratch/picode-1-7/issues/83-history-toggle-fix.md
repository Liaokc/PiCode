# 83: History 按钮 toggle 修复——再点必收

**What to build:** 会话顶栏 History 按钮（branch-history 下拉）展开后**再次点击必收起**；点击外部、Esc 关闭路径不回归。修复「点开后再点不收（关了又开）」。

**背景（取证）：** 票 70 同构竞态——`TreePanel.tsx:37` 挂 document 级 mousedown 外点关闭（不豁免 owning 钮）+ `ChatView.tsx:274` / `App.tsx:1559` click toggle：点 History 钮时 mousedown 先命中外点判定（钮在 panel 外）→ onClose 置 false → click 再 toggle 又弹开。修法照票 70：外点关闭豁免 owning 钮（mousedown 落在 History 钮内则不关，交给 click toggle 收起）或等价实现，票内裁量。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] 展开态再点 History 必收起（electron smoke 断言：mousedown/click 序列回放）
- [x] 真外点照关、Esc 照关、选择分支/复制等面板内动作不误关
- [x] 树面板 navigate/fork/onClose 既有行为零回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-17 (implemented, t83-history-toggle): 外点关闭收敛复用票 70 的 Seam-1 纯函数 `shouldCloseOnOutsideMousedown`（`src/shared/composer/outside-close.ts`，三序规则不变：panel 内不关 → **owning History 钮豁免**（mousedown 交还 click toggle 收起）→ 其余即关），模块 doc 扩围为「带 owning 触发器的所有 popover」（chip 三菜单 + History 面板）。`TreePanel` 增**必填** `anchorRef`（owning History 钮是本面板固有属性，照票 70 chipRef 必填先例），ChatView 挂 `treeBtnRef` 下传；App 的 click toggle 零改动（关的唯一来源 = 钮自身 click）。纯 renderer 状态修，零契约增量。vitest：`outside-close.test.ts` 增「the history panel race, replayed as a sequence (ticket 83)」序列回放（锚必填形态 + 面板内行 + 异钮外点）。smoke 新 `history_toggle` 阶段（自足 fixture：user→assistant→assistant 三链，**真按压序列** mousedown→mouseup→click——旧 `click()` 不发 mousedown，正是竞态藏身处）：①owning 钮 mid-press 半程探针（mousedown 半程 panel 必在场——决定性，pre-83 此处已关）+ 完成半程必收；②panel header 内压不误关；③Esc 照关；④document.body 真外点关死后不复弹；⑤导航行按压（assistant a1，票 79 语义下 user 行导航叶落 parent，故照票 43 先例压 assistant 行）叶标签随行 + panel 保持开。既有 `history_tree`（43）与 `chip_toggle`（70）阶段同跑零回归。
- 2026-09-17 (smoke 加固披露): `slash_gate` 阶段 gateCase 的第二个 Escape 后 300ms 固定 commit 间隙在重载机器上再次丢竞（2026-09-16 双失败同型：Enter 落在 menu 未 commit 闭包上→row 0 `/compact` 真压缩，无 pointer toast）——换**探针式**间隙（poll `.cmp-popover` 消失，3s 预算）后连续全绿。直接服务于本票全绿验证通路，照票 70 顺带加固票 68 阶段先例披露。`visual-tree`（43）harness 尾部增 additive 块：真按压 History 钮 mid-press 在场断言 + 完成收起断言 + `tr83-toggle-closed.png` 截帧（与 `tr43-tree.png` 开帧成对展示「再点必收」），服务新 completion-report 截图规则。
- 2026-09-17 (verification)：vitest 1465/1465 全绿（含票 83 序列回放新测）；typecheck 双 tsconfig 干净。electron smoke 首跑三连环境层失败后处置全绿：①host-contract 阶段「A queue settle」90s 步超时（GLM-5.3-flash thinking max 流式过慢，重跑即过）；②真库 hygiene 142→143 假阳（操作者并行会话写真库，重跑 unchanged）；③`ELECTRON_RUN_AS_NODE=1` 从宿主 Electron 应用继承进 agent shell——electron 阶段被当纯 Node 跑崩（`electron.app` undefined），`env -u` 处置（本会话环境现象，非代码缺陷，已核实 suite 本体不设此变量）；④slash_gate 300ms 丢竞（见加固披露条）；⑤ticket-44 焦点窃取被 macOS 拒一次（操作者活跃输入，票 70 同款限制，重跑即过）。终跑 **SMOKE ALL GREEN（370s，6 阶段，hygiene unchanged）**，含 `history_toggle` 五检查点与 `chip_toggle`/`history_tree`/`slash_gate` 回归。ps 自查按验收项执行（并行仅操作者应用与其 Pi 会话 host，无他 worktree dev-app/smoke）。**操作者：`bash scripts/merge-ticket.sh 83`。**
- 2026-09-17 (code-review 阻塞，未执行)：/code-review 两轴子代理三次尝试均止于 spawn 层——workflow 84bb7345（首跑为启动参数形状错误，已修正）、4f5764b7、50ec8d72 的子 run（f3268ca8 / f5065b51 / e923a7fb）全部报 `async runner did not produce a pid for cwd: …/wt-83-history-toggle`（governed async runner 无法在本会话环境产出子进程 pid；本会话工具 shell 的 PATH 缺 node/pi 且带 ELECTRON_RUN_AS_NODE=1，疑同源）。worktree 干净（HEAD 695acf4）后仍复现，按 lane-blocker 规则停止并上报操作者，未做任何非受控回退。两轴 review 待操作者在可用环境补跑或批准替代方式；实现与验证证据不受影响。
