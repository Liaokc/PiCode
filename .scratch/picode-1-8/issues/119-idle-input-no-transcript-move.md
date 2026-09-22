# 119: 空闲输入不移动转录——agentRunning 门 + 底部目标查证

**What to build:** agent **非运行态**（settled/idle）下 composer 的任何操作（输入/删除/换行/高度变化/附件增减）**绝不移动转录滚动位置**——实现 = 转录滚动补偿/重钉路径的 `agentRunning` 门（精确触发源 dev app 插桩定位后落门，落点票内裁量：scroll-stay 纯模型入参或 ChatView 效应守卫）；**Copy/Fork 行等尾部元素计入底部目标**查证（操作者假设「复制按钮可能不算底部」——若定位证实重钉目标漏尾部元素，一并修）；**运行态语义零回退**（票 93 自发送闩、票 94 折叠锚定、票 75 滚轮永远赢、回底钮显隐全不破）。

**背景（取证）：** 操作者实测（图1→图2）：agent 已停止，输入框任何操作 → 转录上移（消息尾 Copy/Fork 行被推出视口，视图落点 = 消息文本尾、尾部动作行不可见）。静态排查：`ChatView.tsx:145-185` stick effect deps = [entries, expandedTurns, session]（不含 composer 高度）；composer auto-grow 纯 imperative 写高度（无 setState 不触发效应）——**精确触发源静态未定位**（嫌疑：composer 高度变化引发的滚动裁定点/重钉、或 browser 层锚定残余）。操作者机制推测：「一旦检测到输入框有变化，自动校准上方会话的显示到会话底部（复制哪些按钮可能是不算底部？）」。

**Blocked by:** 117（弱邻接转显式串行——composer 高度舞步与转录滚动的交互验证依赖 117 落地）.

**Status:** ready-for-human

## Acceptance

- [x] **dev app 插桩复现 = 第一验收项**：触发源 = **零 JS 写入**（scrollTop-setter/scrollTo/scrollIntoView 补丁全程零记录；scroll 事件 `write:false`）——composer 卡片增长（auto-grow/附件条/expand 滑动）压缩转录 cell 的 clientHeight（655→569），未动的 scrollTop 让视口下缘骑上内容，尾部 Copy/Fork 行滑入 composer 之下。另捕获二阶引擎行为：程序化重钉后的下一次 React 布局**原生恢复钉前绝对 scrollTop**（观测 −9px 无任何 JS 写入；caret mirror 强制 relayout ~200ms 后的延迟恢复无几何变化 → RO 不触发）。证据链：`/Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes/t119-progress.md`（P2/P5/P6/P8 + telemetry 转储 `/tmp/t119-t4.txt` `/tmp/t119-t5.txt` + 截图 `.scratch/visual/c119-*.png`）
- [x] 修复后 electron smoke：`idle_typing_119` 阶段（零模型调用，seeded settled session，CDP Input.insertText）4/4 连续全绿——底部钉定读者单行/多行/附件增删/expand 收展/清稿后每步 distance<1 + 尾部 Copy/Fork 行在视口；中部读者同样操作 rAF 逐帧 scrollTop 精确不变（0 帧移动）且卡片高度实测增长 ≥40px（操作结束于清稿 → 判据取操作期间最大卡片高，避免前后比较恒空的假阴性）。tail 行计入底部目标已查证：全部底部钉写 `scrollHeight − clientHeight`，含 tail 行——「Copy 按钮不算底部」假设**证伪**，缺的是补偿本身
- [x] 运行态回归全保留：`agentRunning` 门整个补偿臂（RO 效应在运行态提前返回；scroll 臂 `!chat.agentRunning` 门）；票 93 发送闩/票 94 折叠锚定/票 75 滚轮法/回底钮显隐零改动——vitest 2052 全绿（新增 `nextIdleBottomPin` describe 块 11 用例 / 23 断言，该测试文件合计 24 用例：重钉逐 delta、引擎恢复再钉、自滚关闭序列、回底重臂、0 地板、与增长 stick 组合）
- [x] vitest / typecheck 全绿；smoke 运行前 `ps` 自查（一次与 wt-131 并发后已改为等待清窗再跑；最终验证运行于清窗）

## Comments

- 2026-09-22 (requirements intake)：P26 定稿为 R18。触发源静态穷尽未定位（stick deps 不含 composer、auto-grow 零 setState）——复现定位 + 修复同票；操作者机制推测两处（自动校准到会话底部 / Copy 行不算底部）列为插桩方向。

- 2026-09-22 (implementation, tip c82544e on t119-idle-input)：修复 = `scroll-stay.ts` 纯模型 `nextIdleBottomPin`（序列闩：`clientHeightStartPx` 基线 + 累计收缩界 `distance ≤ cumulativeShrink + 1`——同时容纳自然下落与引擎恢复（恢复落点 = 序列起点绝对位置 → 距底恰为累计收缩），一次到底检查无法幸存；自上翻破界关闭序列、逐字节不动；回底重臂；视口增长关闭（浏览器 clamp 已管）；`USER_SCROLL_QUIET_MS=250` wheel/pointer 门）+ `ChatView.tsx` 双臂（RO 臂 deps `[agentRunning]` 翻转重置 + scroll 事件臂捕获无几何变化的延迟恢复）。插桩探针（`visual-t119-probe.ts` + index.ts/visual.ts 接线）**已删除**。smoke：`idle_typing_119` 阶段置于 t44 之前（t129/t117/t125/t130 迁移先例——本环境 t44 真窗口焦点窃取间歇失败，基线 stash 复跑亦然）；crash-isolation 阶段改 `pidForSession(created.sessionId)` 选受害者（seeded 阶段合法自起 host，`hostPid`（最新）会杀错——修复后 SIGKILL 期全绿）；t28 断言失败为**先存环境性竞态**（后台回合在探测前结束，run-dot 正确消失；事件尾 `agent_end`、DOM 无 active 行——选择已正确跟随视图；与本次 diff 零交集，误导性失败消息已补 DOM 转储）。自审：Standards+Spec 双轴（纯模型收敛、命名单一拼写、无 TODO/占位、探针净删、`__t119Frames` 清理）。
- 2026-09-22 (review round, spec edge items)：**(c)① agent_end 翻转重置后无 at-flip 重臂——判定为已覆盖的已知行为边界，非缺陷**：翻转到 idle 时 RO 效应重建 observer，`observe()` 按 ResizeObserver 语义在下一渲染机会**播报初始尺寸**（本环境实证：探针 RO 遥测 t=2732 两条初始记录无几何变化）——run 结束时钉在底部的读者在首次击键前即被初始回调重臂 {当前 ch}，首个 burst 得到补偿；被 heldAway 的读者初始回调读到离底 → 不臂 → 其输入零移动（顶锚不动，正确）。smoke fresh-open 路径经 arrival-pin 的 scroll 事件重臂（已覆盖），post-run 路径依赖初始播报（本环境已证）。**(c)② armed burst 内自滚上移 ≤ 累计收缩量 (+1) 时后续收缩 re-pin 拉回底部——判定为真实缺陷（票 75「滚轮永远赢」在 ≤C+1 带内失效）**：读者自 pin 底上移 M，距离 = M ≤ C+1 仍在累计收缩界内 → 下次收缩 RO re-pin 将其拉回底部（违背其手势方向）；250ms 静默窗只门 scroll 臂的手势自身事件，RO 臂无手势门。已向主 Agent 报决策请求（最小修：现有 wheel 监听在 deltaY<0 时同步关闭序列闩——与票 75 heldAway 语义对称，回底重臂；顺带覆盖 RO 臂在静默窗内的洞。遗留边界：滚动条拖拽上移，pointerdown 无方向信号，可后续用按住期间 st 下降观测关闭）。模型未动。
- 2026-09-22 (edge ② 裁决实施，主 Agent 批准最小修)：wheel 上移（`deltaY<0`）**立即关闭序列闩**——滚轮上移是无歧义的用户离底意图信号，票 75「滚轮永远赢」不变量优先于补偿，即使仍在累计收缩界内（界内观测无法区分手势与引擎恢复）也不再被后续收缩 re-pin 拉回。模型侧走**既有 close 转移**（`closeIdleBottomSequence()` → `IDLE_BOTTOM_SEQUENCE_IDLE`，与 bound-break 同一终态，无新增状态机分支），wheel 监听胶水调用之；回底重臂照旧。新增 2 测试：①armed burst 内 wheel 上移未破界也立即关闩、后续收缩不再拉回（对照：同观测下未关闩会 re-pin 到底）；②关闩后回底仍重臂（既有不变量不破）。**已知边界**：滚动条拖拽上移在 pointerdown 无方向信号、不关闩——离底超过累计收缩界后由既有 bound-break 关闩，与票 75 自身对手势的覆盖口径同类，不扩本票范围。
