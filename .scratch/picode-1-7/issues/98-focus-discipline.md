# 98: 按钮焦点纪律——blur 归还 composer、focus 圈仅键盘

**What to build:** 全局按钮焦点纪律：①鼠标点击与菜单键盘选择完成后**按钮立即 blur、焦点归还 composer 输入框**（Enter 永远回到发送——现状：点完 + / 选完模型 / 点完 History 后 Enter 被聚焦按钮吃掉）；②橙色 focus 圈**只在纯键盘 Tab 导航出现**（:focus-visible——鼠标流永远不可见；Tab 圈保留 = Q19 拍板）；③全局清扫交互控件（chip / History / + / 菜单行 / 工具卡钮 / 侧栏钮 / 顶栏钮）。

**背景（取证）：** `--accent-orange #ec7931`（`app.css:25`）focus-visible 规则散布（md-block-btn:5006 / diagram menu item:5244）；点击/菜单选完焦点滞留 → 浏览器原生 Enter 激活聚焦钮（操作者截图 pi17-focus-rings 三现场）；菜单键盘统一是 1.6 票 68/69 基座——本票不得破坏其 hover/键盘选中模型。

**Blocked by:** 91（图片预览浮层——composer 群收官后统一清扫）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：点 + → Enter = 发送（不触发文件选择）；选完模型 → Enter = 发送（不重开菜单）；点 History → Enter = 发送；composer 输入焦点全程保持
- [x] 菜单键盘导航（1.6 票 68/69 行为）零回归——键盘选完同样归还 composer
- [x] Tab 导航 focus 圈可见（:focus-visible），鼠标点击后无圈（截图级视觉断言）
- [x] 清单留档：全量交互控件扫描结果（无遗漏控件）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-20 (implement session，分支 t98-focus-discipline，开工前 rebase 核对 = main f1008ea 含 91/97 基座，无需 rebase)。
  - **Seam-1（TDD 先红后绿）**：`shared/composer/focus-discipline.ts` 表驱动 vitest 8 例（`tests/shared/composer-focus-discipline.test.ts`）——核心纯决策 `shouldComposerReclaimFocus(active)`：`null`（焦点随卸载控件坠落到 body）→ 归还；editable（input/textarea/select/contenteditable）→ 不夺（caret 属于聚焦它的流程）；`[data-focus-keep]` 表面内 → 不夺（自持焦点生命周期的表面）；其余（pointer 激活后滞留焦点的按钮）→ 归还。三常量导出（`RECLAIM_CLICK_SELECTOR` button + ARIA button/option/menuitem/menuitemradio/tab、`EDITABLE_FOCUS_SELECTOR`、`FOCUS_KEEP_SELECTOR`）。
  - **渲染层唯一胶水** `src/renderer/src/composer-focus.ts`：① `installComposerFocusDiscipline()` —— App 挂一个 document 级 click 监听（workspace 窗口终身），命中纪律控件即 `reclaimComposerFocus()`；**rAF 延迟探测**（点击后终态：拾取可能卸载控件、rename 输入可能 autoFocus——探针只看终态）；无 composer（FollowView）= no-op。② `reclaimComposerFocus()` 供无 click 的关闭路径复用（⌘K palette 键盘拾取）。`.composer-input` 类查询成立依据 = 全窗口同时只挂一个 composer（OPEN_MODEL_MENU_EVENT 先例）。
  - **菜单键盘模型修复（真实可达性）**：`ComposerPopover` captureKeys 的 autoFocus 原落在**容器 div** 上——真实键盘 keydown 以 div 为 target 永远不经过子级 listbox，flatMenuKey 只对 synthetic 派发生效（真实用户 ↑↓/Enter 死、仅 Esc 活）。现 layout effect 把 capture 落在**选中行**（`[aria-selected="true"]`，票 68/69 选择模型零改动）：真实 keydown 从行冒泡进 flatMenuKey、真实 Enter 走拾取。popover 根标 **`data-focus-keep`**（captureKeys 时）——**纠偏过程发现**：document 纪律会把焦点从菜单行夺回 textarea、与键盘模型打架（visual dump 取证 activeElement=TEXTAREA）；data-focus-keep 让「菜单开着」= 纪律不抢，关闭路径（composer 的 menu→null effect）照旧归还——正是 seam 里「自持焦点生命周期」概念的第二个用户。
  - **composer**：`menu→null` effect —— 菜单关闭（键盘拾取/Escape/外部 mousedown/chip toggle）后 rAF 焦点回 textarea（键盘拾取无 click 事件，document 纪律覆盖不到）；slash/file 菜单焦点一直在 textarea = no-op。既有归还点（transitionExpand / closePreview / 卡片× / prefill）不动。
  - **CSS（②）**：base `button` 后新增票 98 块——`button:focus-visible` + ARIA button-likes 橙圈 2px（Q19 Tab 圈保留，全局兜底）；`.cmp-popover:focus-visible` 抑制（空目录菜单脚本聚焦容器无圈）；既有专项规则（nav-tick 1px、md-block-btn 1.5px、缩略图 2px、cmp-menu-row none——键盘指示是灰选中高亮）特异性更高全部保留。**附带修复**：`.toast-stack` pointer-events:none + `.toast` 卡片 auto——toast 锚在 footer 右上方，空容器/间隙此前吞掉底下 chip 的点击（smoke 真点击取证：trusted click 命中 `.toast-stack` DIV 而非 model chip；真实用户 gate toast 后 4.5s 内点 chip 同样被吞）。
  - **显式 opt-out**：`ImagePreviewOverlay` 根 + `SettingsWindow` 壳 `data-focus-keep`（浮层 ❌ 持焦 + 卸载自还；设置窗壳内的活控件不被隐藏 composer 抢走——退出时壳卸载、焦点坠落 body → 纪律自然归还 composer ✓）。⌘K palette `pick()` 补 `reclaimComposerFocus()`（键盘跳转无 click）。
  - **全量交互控件扫描清单（无遗漏）**——覆盖机制两用：document click 纪律（含 4 个可点击 div 行例外 `.tree-row/.sb-task/.sb-group-header/.sb-show-more`）+ 菜单关闭路径/既有 rAF 归还点：
    | 控件簇 | 覆盖 |
    |---|---|
    | composer footer：+ / access·model·thinking chip / Steer·Follow-up / Stop / Send | click 纪律（rAF 归还）；chip 菜单开=popover 持焦（data-focus-keep），关=menu→null 归还 |
    | composer 展开钮 / 附件× / 卡片× / 附件缩略图 | 展开钮·卡片×·closePreview 既有 rAF 归还；附件× click 纪律；缩略图开浮层（浮层自还+closePreview rAF） |
    | slash/file 菜单行 | 拾取路径 updateValue 焦点回 textarea；built-in 路径 menu→null effect；click 纪律兜底 |
    | chip 菜单行（access/model/thinking 级联） | 键盘拾取/Escape/外部关闭 → menu→null 归还；鼠标拾取 → click 纪律（行卸载焦点坠 body → 归还） |
    | 顶栏（chat-topbar）：Rename / History | click 纪律（Rename 落 rename input=editable 持焦 ✓；History 开 TreePanel、caret 回输入框、panel Escape 自关） |
    | 标题栏（TitleBar）：sidebar/bridge/terminal/side-panel/settings toggle | click 纪律（settings 开壳=壳持焦，back 卸载后归还） |
    | 侧栏：会话行 / pin·archive / 群组头折叠 / 群组菜单 / 过滤菜单 / 新会话 / 设置 / 折叠全组 / Show more | click 纪律（`.sb-task`/`.sb-group-header`/`.sb-show-more` div 行例外入列；切会话 → 新 composer 挂载被 rAF 聚焦） |
    | 转录：ToolCard 折叠 / MessageActions（Copy·Edit·Fork）/ md-block-btn / DiagramCard 钮+菜单 / TurnFileBar / BridgeJumpChip / 回底钮 / UserBubble 缩略图 | 全 click 纪律（树行 `.tree-row` div 例外入列） |
    | 侧板 tabs（SidePanel/PanelTabMenu/PreviewTab）/ Trace/Review/Subagents 工具钮 / 搜索输入 | 钮=click 纪律；搜索输入=editable 持焦 ✓ |
    | 覆盖层：图片预览浮层（❌/翻页）/ ⌘K palette（输入框+行）/ Toast | 浮层 data-focus-keep 自持（退出自还→composer rAF）；palette 输入框 editable 持焦、行拾取→pick() 显式归还（切会话新 composer）；toast 卡片 pointer-events auto |
    | 设置窗壳（全部 section 按钮/输入） | 壳根 data-focus-keep（窗中窗自持；退出壳卸载→归还） |
    | 终端 dock / xterm | xterm helper textarea=editable 持焦 ✓（票 105 聚焦路径不属本票） |
  - **验收 harness**：① smoke stage `focus_discipline_98_*`（91 stage 之后、零模型流量）——**全部 trusted 事件**（sendInputEvent；synthetic 不动焦点，而焦点正是本票标的物）+ trustedUntil 重试形状（操作者机器随时夺焦=ticket-44 环境类，断言严格、只重驱被 OS 丢的事件，重试均幂等）：真点击 + → caret 回输入框 → gated Enter（`/tree␣` 尾随空格为承重件：裸 `/tree` 会被 fuzzyRank 模糊命中其他命令、Enter 走拾取而非 gate——取证后修正）→ gate toast=发送路径活；真点击 model chip → 级联开 + capture 在选中行 → 真点击 checked 行幂等拾取 → 菜单关 + caret 回 + 型号零变 → bare Enter 不重开；真点击 access chip → **真实 Enter 键盘拾取**（68/69 模型真实可达性）→ caret 回 + tier 零变；真点击 History → 面板开 + caret 在输入框 → gated Enter 不重-toggle → Escape 关面板；真 Tab 匹配 :focus-visible（Q19 圈）。② `chat:pick-images` smoke/visual 桩（防原生对话框卡死）。③ `visual:focus` harness（`npm run visual:focus`，新 `visual-focus.ts`，visual.ts/index.ts/package.json 同 91 模式）：Tab 圈帧 + 鼠标无圈帧（截图级断言）+ gate-Enter + 菜单腿。
- 2026-09-20 (verification)：`ps` 自查（一次发现 wt-99 并行 smoke 窗口，等待其结束再跑）。**vitest 1766/1766（108 文件，含新 seam 8 例）+ typecheck 双 tsconfig 清 + eslint 清（本票全部触碰文件）**。**electron smoke 全套 EXIT=0**——`focus_discipline_98_plus_ok / model_ok / keyboard_pick_ok / history_ok / ring_ok` 五腿全绿，全套此前偶发 stage（slash_gate/ticket-46/ticket-28）本轮亦全过。**visual:focus 全绿**（6 探针）+ 截图帧：`.scratch/visual/c98-a-tab-ring.png`（Tab 后展开钮橙圈 + ⌘E keycap 在场——Q19 圈人眼可判）、`c98-b-mouse-noring.png`（点击 + 后 caret 在输入框、+ 钮仅 hover 态、全窗无圈——鼠标流无圈人眼可判）。**取证链**（迭代中的三次根因修正，全部有 dump 佐证）：① `/tree` 无尾随空格被 fuzzyRank 模糊命中 → Enter 走菜单拾取（value 被 card 路径清空的 dump）；② gate toast 悬挂期 `.toast-stack` 吞 chip 真点击（`down@1099,848:DIV` 事件 trace）→ 顺带修复产品级 pointer-events 缺陷；③ captureKeys popover 与纪律的焦点争夺（activeElement=TEXTAREA dump）→ data-focus-keep 接缝修复。CONTEXT.md 增「按钮焦点纪律」词条（Avoid: 焦点抢劫 / :focus 环 / 每控件各自 focus()）。
- 2026-09-20 (merge session，per 操作者验收指令「98 工单已验收」)：Status 翻转 ready-for-human + 五验收框按 Comments 既有证据链勾选（实现含三项取证根因修正 / verification：vitest 1766 + smoke EXIT=0 五腿 + visual:focus 全绿 + 全量控件扫描清单在案）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。「按钮焦点纪律」词条已随票入册（merge diff 核对）。
