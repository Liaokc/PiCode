# 105: 终端开启即聚焦——⌘J/终端钮直达可输入

**What to build:** ⌘J 或标题栏终端钮打开终端停靠后，**输入焦点立即进入 userTerm**（xterm）——不再需要额外点击。桥接面板与终端同框时切回终端（⌘J 语义）同样聚焦；桥接面板可见时不抢焦点。挂载时序（xterm 需可见后聚焦）由票内裁量（rAF/effect）。

**背景（取证）：** `TerminalDock.tsx` 仅面板点击路径有 `kit.userTerm.focus()`（focusUser/restart）；dock 开合路径（keymap `toggle-terminal-panel` → dockDispatch）无任何聚焦调用。操作者原话：「希望输入焦点立马到终端中，而不是还要我点击一下」。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：⌘J 打开终端 → 焦点在 userTerm（键入直达 shell）；标题栏钮同；⌘J 再开合循环不失效
- [x] 桥接同框时切回终端聚焦；桥接面板显示时终端不抢焦点
- [x] 终端既有交互（restart/桥接跳转/滚动）零回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implement session，分支 t105-terminal-focus，rebase 后 @ fcfb88c 含 114/R35)。同日 wt-106/107 并行，smoke 窗口多次让位 serialization（含一次自查疏失即发即止，均 ps 复查后重跑）。
  - **Seam-1（TDD 先红后绿）**：`shared/dock-model.ts` 新增 `DockState.focusSeq` 焦点请求序列——只有「让终端成为可见面板」的动作 bump：`toggle-terminal-panel` 打开/切回分支、`new-session`（仅 panel==='terminal' 时，防桥接显示时聚焦隐藏 shell）；⌘J 关闭 / hide-dock / close-terminal-tab / 桥接三动作 / 任务切换重挂载零 bump。表驱动 vitest 8 例（dock-model.test.ts 新 describe）：⌘J 开 bump、关不 bump、开合循环持续 bump、桥接切回 bump、桥接三动作零 bump、hide/close-tab 零 bump、+ 在 terminal 显示时 bump / bridge 显示时不 bump、任务切换重挂载携带旧序列不聚焦。`initialDockState` focusSeq=0；零 IPC 契约增量（DockState 加法字段，并行期 additive-only 合规）。
  - **渲染层唯一胶水（TerminalDock.tsx）**：① seq-diff effect 常驻 TerminalDock（dock frame 不随任务切换重挂载 → diff 跨 workspace 重挂载存活，切任务不抢焦点）；② focusRef 注册制：TerminalWorkspace 挂载时注册 `() => kit.userTerm.focus()`、卸载置 null；③ **挂载时序裁量 = 双 rAF**：pane-motion 把 visibility 纳入 transition（开首帧即 visible）、面板互换走 display:none——focus() 进 stale 渲染会静默失效，双 rAF 保证先有一帧真实渲染再聚焦。restart 既有 `kit.userTerm.focus()` 未动；BottomDock 透传 `dock.focusSeq`。
  - **electron smoke**：keymap stage 后新增 `terminal_focus_105`（合成 ⌘J 沿 keymap 先例——resolver 只读 code+modifiers、聚焦是程序性的；**键入腿 = 真实 sendInputEvent keyDown 'z'** + 窗口焦点硬门 + trustedUntil 式重试，回显进 `.xterm-rows` 即「键入直达 shell」的 pty 往返证据；小写故意——xterm v6 把 A-Z keydown 让给 keypress；焦点探针 = activeElement 为 `.xterm-helper-textarea`）。五腿 + 还原现场（照 keymap 礼仪）：①⌘J 开→焦点在 shell；②真实键入回显；③标题栏钮同（合成 click 同样穿过票 98 click 纪律——纪律 rAF 探针见 editable 不夺，终态断言把关）；④开合循环不失效；⑤⌥⌘J 桥接显示时隐藏终端不持焦 + ⌘J 切回重聚焦。
  - **code-review 双轴**（review-standards + review-spec 并行子代理）：零硬违反、不打回。Standards 判断性意见两条已采纳整改（stage 内重复 waitForProbe+fail 形状收拢为 `ensureDockState`/`ensureShellFocus`；`DOCK_STATE_105`→`DOCK_STATE` 按内容命名；stage 日志名 `terminal_focus_105_*` 保留——本文件票号 stage 纪律 98/81/86 先例）；focusRef 手写句柄 vs useImperativeHandle 判可接受照录。Spec 意见：restart/桥接跳转/滚动回归腿未入 smoke——三条代码路径零触碰 + TerminalSession vitest 全套兜底（重启腿需 shell 真退出，无既有 UI 驱动路径），覆盖理由入账；`+` 钮 bump 属票外轻微延伸（restart 的 spawn-to-type 先例，注释+测试钉死，bridge 显示时不 bump）；双 rAF 不随关闭取消 = 理论空窗无实际触发路径（关闭不 bump、再开必 bump，终态正确）。
  - **复验**：vitest 1877/1877（112 文件，含新 8 例）+ typecheck 双 tsconfig 清 + eslint 触碰文件清；electron smoke 全套 EXIT=0（`SMOKE done`、零 FAIL），terminal_focus_105 七标记（cmdj/typing/titlebar/cycle/bridge_no_steal/swap_back）全过。偶发环境类记录：三轮先跑分别翻在 bg_approval（模型流无工具调用）、ticket-91 贴图暂存、ticket-28 行选择——均为模型流时序类既有腿，与本案 diff 无关，末轮全过。
  - **视觉帧（操作者追问截图后补）**：新增 visual harness `npm run visual:terminal-focus`（`src/main/visual-terminal-focus.ts`，PICODE_VISUAL_TERMINAL_FOCUS=1；隔离 store + 真实项目目录种子会话——终端需 workspace 才有 shell）：①合成 ⌘J 从关闭态开啉（聚焦是程序性的，合成驱动诚实；探针断言零点击入终端 activeElement 即 xterm helper textarea 且 `.xterm` 带 focus 类）→ 等 fish 提示符渲染 + 轮询光标 blink-on 相位再截帧；②真实受信点击 composer 移走焦点（`focus` 类掉落）→ 对比帧。**两帧人眼可判**：`.scratch/visual/c105-a-cmdj-focus.png`（一次 ⌘J 后实心块光标在提示符上 = 打开即可打字）、`c105-b-blur-contrast.png`（点击 composer 后光标变空心框、caret 回输入框 = 对比组）。harness 接线（index.ts 隔离 userData + 启动、visual.ts 独占门、package.json 脚本）后 vitest 1877/1877 复验 + electron smoke 全套重跑 `SMOKE done` 零 FAIL（启动路径无回归）。
  - **操作者：`bash scripts/merge-ticket.sh 105`。**
