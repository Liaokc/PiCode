# 86: 侧栏零标签自动折叠

**What to build:** 右侧边面板的**所有 tab 关闭后，面板自动折叠**——不再残留一个空壳（"Choose which tab to open" 选择页）。重开路径不变：⌥⌘B / 标题栏钮 → 面板打开；零 tab 时显示既有的 tab 选择页（兜底 UI 现成）。深链打开新 tab 时面板自动展开的既有行为不回归。

**背景（取证）：** 零 tab 状态可达（review 也可关，`panel-model` close-tab 无特判，`panel-model.ts:198-209`）；关到零时 `SidePanel.tsx:124` `showPicker = pickerOpen || openTabs.length === 0` 显空壳选择页而面板 open 状态不变。开合状态在 shell 布局模型（`layout-model.ts` sidePanelOpen）、标签在面板模型（panelReducer）——跨模型联动的落点票内裁量（渲染层派生 effect 或 App 层联动均可，纯状态修零契约）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] 关闭最后一个 tab → 面板自动折叠（electron smoke 断言开合状态 + 无空壳残留；见 Comments 环境限制说明）
- [x] ⌥⌘B / 标题栏钮重开 → 零 tab 时显 tab 选择页；从选择页/最近关闭重开 tab 正常
- [x] 深链（文件/轨迹/turn-diff/Review）打开时面板自动展开不回归
- [x] Seam-1：零标签→折叠联动纯逻辑表驱动
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-17 (implement session，联动设计)：跨模型联动落点 = **App 层边沿触发 effect + 共享纯谓词**（票内裁量授权的「App 层联动」形）。核心取舍：零标签→折叠必须是**边沿触发**（只在 >0 → 0 转换且面板打开时收起），不能是电平派生（`sidePanelOpen && tabs===0` 恒收起会杀死验收项 2——⌥⌘B 重开零 tab 必须停在空态选择页）。落点：
  - `layout-model.ts` 新增纯谓词 `shouldAutoCollapseSidePanel(prevOpenTabs, openTabs, sidePanelOpen)`（决定的是 shell 的 `close-side-panel` 动作，归 shell 布局模型；layout-model 是被 panel-model 依赖的下层，导入方向不变零契约增量）；表驱动 vitest 8 行决策表 + close-side-panel reducer 幂等兜底断言（tests/shared/layout-model.test.ts，红→绿先行）。
  - `App.tsx` 挂 effect：`openTabsCountRef` **在 effect 内部**更新（渲染期写 ref 会在 StrictMode 双渲染下丢转换），批量 dispatch 合并为一次 commit，故「同一批内关开相抵的中间零」永远不会触发折叠——从未渲染的空壳不该折叠。
  - 深链不回归：`open-tab` + `open-side-panel` 的既有联动零改动（0→1 转换不触发谓词）。
- 2026-09-17 (implement session，验证记录)：
  - vitest 全套 1485/1485 绿；typecheck 双 tsconfig 清；eslint 改动文件清。
  - **capture harness**（`.scratch/.../86-panel-empty-autocollapse/captures/capture-86.mjs`，built app + 隔离 userData + CDP 9346，dev-app serialization 前 `ps` 自查过）：零 tab 重开显选择页、选择页卡片开 Review tab、**关最后一个 tab 面板自动折叠且无空壳残留**、折叠后再重开选择页回归——四路断言全绿，帧 1/2/3 已存同目录。踩坑记录：无壳判定不能用 `getClientRects()`（visibility:hidden 面板保留布局盒，rects 非空），正确探针 = 面板 `data-closed` + computed visibility/opacity/offsetWidth。
  - **electron smoke**：新增 `panel_collapse_86` stage（smoke.ts，panel_tabs 后）：①关光残留 tab→末关自动折叠+无壳残留；②⌥⌘B 重开选择页→Review 卡开 tab→review 深链 chip 开第二 tab→**关非末 tab 面板保持开（谓词不过触）**→关末 tab 再折叠；③⌄ 菜单最近关闭重开（tab 回来面板开）；④**从折叠零 tab 状态侧栏右键 View call trace 深链→面板自动展开**（tab body 在 visibility:hidden 面板内也会渲染，故只有开合状态探针才能证明深链回归真发生）。首轮已跑到本 stage 且 `panel_86_autocollapse_ok` 绿（真 smoke 环境验证联动本身）；随后 stage 内 ⌥⌘B press-until-open 撞上 toggle 竞态（同步 dispatch+check 读到 dispatch 前的 DOM→下一轮再 dispatch 打乒乓）——已修为「press 后等 ≥400ms 再查、仍关才再 press」的防乒乓版（capture harness 的 dispatch/probe 分离形态本就免疫，四路全绿为证）。
  - **全套 smoke 重跑受操作者活跃阻断**（同 T81/T83 已记录限制）：连跑两轮分别止于 bg_approval deny 理由输入阶段（键入文本混入操作者键击 "xu"/"hi"——smoke 窗口反复抢焦点期间操作者正在打字）及首轮 ticket-76 模型目录竞态；stage 代码已入、等操作者停手 ~15s 或自前台终端 `env -u ELECTRON_RUN_AS_NODE PATH="$PWD/node_modules/.bin:$PATH" npm run build && npm run smoke:electron` 补跑（注意本会话 shell 带 `ELECTRON_RUN_AS_NODE=1`，须 unset，否则 Electron 退化 plain-Node 模式无法启动——T81 同款环境坑，capture harness 内已显式 delete）。
- 2026-09-17 (implement session，smoke 全腿绿)：续修后 **electron smoke 本票 stage 六腿全绿**：`panel_86_autocollapse_ok / reopen_picker_ok / partial_close_ok / autocollapse_again_ok / recent_reopen_ok / deeplink_expand_ok` + `panel_collapse_86_done`，其后 `trace_tab_open_ok`（含本票加的深链展开卫兵）同绿。两处修复：①⌥⌘B press-until-open 改防乒乓（press 后等 ≥400ms 再查、仍关才再 press）；②侧栏行缺 cause = 多阶段先例「新建会话需一个 settle turn 落盘文件索引才列行」——stage 现以 `PICODE_SMOKE_OK` settle 轮先行（同 multi stage 模式）。卫兵双保险：trace stage（ticket-36）末尾新增「深链后面板壳必须开」断言（tab body 在 visibility:hidden 面板内也渲染，只有开合状态能证明深链真展开；本票 stage 收尾留下「折叠+零 tab」使该断言非空虚）。其后套件止于 ticket-81 滚动条拖拽腿（真鼠标拖拽，被同刻并发跑 smoke 的 wt-84 会话抢焦点干扰——序列化本会话失误一次：启动时 ps 打印了 wt-84 进程但未硬门控；本票 stage 断言均为窗口内 DOM 探针，并发不损其有效性，拖拽类真输入阶段才受扰）。**补跑通路**：操作者停手且无并发 smoke 时 `npm run build && npm run smoke:electron`。
