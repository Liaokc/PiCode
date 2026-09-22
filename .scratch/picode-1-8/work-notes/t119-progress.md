# t119 progress — 空闲输入不移动转录（agentRunning 门 + 底部目标查证）

## 目标一句话

agent 非运行态（settled/idle）下 composer 的任何操作（输入/删除/换行/高度变化/附件增减）绝不移动转录滚动位置——插桩定位精确触发源后在滚动补偿/重钉路径落 agentRunning 门，并查证 Copy/Fork 行等尾部元素是否计入底部目标；运行态语义（票 93/94/75、回底钮）零回退。

## 插桩证据链（2026-09-22，dev app 实测，探针 visual-t119-probe，输出 T119PROBE*）

**复现环境**：seed 会话（user + 44 行 assistant 文本，backdate 1h）→ 侧栏点击 → ChatView settled/idle，到达钉底 st=305/ch=655/sh=960/dist=0，尾部 Copy/Fork 行在视口内（tailBottom=−18，含 18px 底 padding）。

**逐阶段读数**（遥测：scrollTop setter 实例补丁带栈 + scroll 事件 + rAF 逐帧几何 + ResizeObserver + scrollIntoView/scrollTo 补丁）：
- P1 单行逐字符输入（17 字符，无高度变化）：st/ch/cardH 全程不变，尾部行在视口。**零写入、零滚动事件**——单行输入本来就静止。
- P2 多行增长（7 段）：composer 卡 130→216，chat-scroll clientHeight 655→569（Δ=86），**scrollTop 全程 305 不变，零写入、零 scroll 事件**；dist 0→86，尾部 Copy/Fork 行 tailBottom −18→+68（被推出视口 68px，即操作者「视图落点 = 消息文本尾」的实拍）。
- P3 删除回空：卡 216→130，ch 回 655，dist 回 0（st 从未上升放无需 clamp，尾部行自然回来）。零写入零事件。
- P4 中位滚开复测失败于种子太短（sh/2=480 > max=305，浏览器原生 clamp 回 305）——smoke 阶段需加高种子；另一探针自身写入 305→480 被 clamp 证明原生 clamp 存在。

**根因定案**：
1. **idle 态 composer 操作零 scrollTop 写入**（全套遥测唯一一次写入是探针自己的 P4 程序滚动）——不是任何代码写了 scrollTop。
2. **不是浏览器原生移动**（零 scroll 事件；overflow-anchor:none 已禁锚定；增长方向无 clamp）。
3. **真正动的是视口几何**：composer 卡 auto-grow/附件条 → .chat-body(flex:1) 被压缩 → .chat-scroll clientHeight 缩小 Δ，scrollTop 不动 → 视口底边上移 Δ → 尾部行被推出视口、dist 0→Δ。
4. **无任何重钉/补偿**：stick effect deps=[entries, expandedTurns, session] 不含 composer 几何；即便跑，grew=false 也不钉（模型无视口变化臂）。票面预设的「重钉目标漏尾部元素」假设**证伪**：所有钉底目标（el.scrollHeight / foldAnchor max=sh−ch）都含尾部行（P0 tailBottom=−18 证明 scrollHeight 覆盖 Copy/Fork 行）。操作者「Copy 行不算底部」的感知 = 无补偿时尾部行被挤出视口的表象。

**修复方向（票内裁量定案）**：给视口几何变化加 idle 门的重钉补偿——非运行态 + 缩放前读者在底部（isAtBottom 旧几何口径）+ 视口缩小（ch 减小）→ 钉到新底（st=sh−ch，恰为 st+|Δ|，保底边锚）；其余情况（非底部读者/视口增大——原生 clamp 已保底）一律不写。运行态零改动（票 93/94/75 语义不动）。决策收敛 scroll-stay 纯函数。

## 日志

- [2026-09-22] 插桩跑完（证据见上节）：探针一次跑出完整证据链，截图 c119-p0-baseline / p1-single-line / p2-multi-line / p3-deleted / p4-mid-transcript 落 .scratch/visual/。根因 = 视口几何被压缩无补偿，非 scrollTop 写入。

- [2026-09-22] 阶段=开工：已读票面 119-idle-input-no-transcript-move.md 与 CONTEXT.md；接下来读 spec R18、检查基线代码（ChatView.tsx、composer auto-grow、scroll-stay 模型、117 的 reveal 路径）。分支 t119-idle-input 基于 main dbdb52a。
- [2026-09-22] 基线盘点（静态，未定位）：scroll-stay.ts（票45/75/93 纯模型）+ ChatView.tsx stick effect deps=[entries, expandedTurns, session]（不含 composer 高度）；Composer.tsx 折叠态 typing-commit 走 `height:'auto'` 重测再钉（R7 快照恢复只护 textarea 自身 scrollTop）；117 的 revealComposerCaret 只写 textarea 自己的 scrollTop（镜像测量）。布局链：.chat-view(flex col) > .chat-body(flex:1) > .chat-scroll(flex:1, overflow-anchor:none) + .chat-dock(composer 卡)。composer 高度变化→chat-dock 变高→chat-scroll clientHeight 变。静态嫌疑人：①clientHeight 变化裁剪尾部行（无 scrollTop 写）②浏览器原生 clamp ③某个未发现的 scrollTop 写。CSS `.composer-input{min-height:74px}` 使 auto 往返在 ≤cap 草稿上无瞬时塌陷——静态无法定案，按票面走插桩。
- [2026-09-22] 插桩方案（临时探针，取证后删除）：仿 visual-send-pin.ts 模式新建 src/main/visual-t119-probe.ts——seed 会话文件（user+长 assistant 文本，backdate 1h 避开 Live Follow）→ 侧栏行点击开 ChatView（settled/idle）→ executeJavaScript 装遥测：.chat-scroll 实例级 scrollTop setter 补丁（带调用栈）、scroll 事件（区分写触发/原生）、rAF 逐帧几何（scrollTop/clientH/scrollH/composerH/尾行可见性/body scroll）、ResizeObserver、Element.prototype.scrollIntoView/scrollTo 补丁 → 分阶段驱动：P0 底部基线 / P1 单行逐字符输入 / P2 多行增长(74→160 cap) / P3 删除 / P4 中位滚开后再输入 → 每阶段截图+几何快照，遥测 JSON 落 stdout。npm install 已补完（ELECTRON_MIRROR），electron v44 就绪，typecheck 绿。


## Final (tip c82544e on t119-idle-input)

- Fix shipped: `scroll-stay.ts` pure model `nextIdleBottomPin` (sequence latch `clientHeightStartPx` + cumulative-shrink bound `distance ≤ shrink + 1`, which holds through BOTH the natural fall and the engine's pre-pin revert since the revert restores the sequence-start absolute → distance exactly the cumulative shrink; own-scroll-up breaks the bound → sequence closes, view byte-for-byte untouched; 回底 re-arms; viewport growth closes — browser clamp's territory; `USER_SCROLL_QUIET_MS=250` wheel/pointer gate) + `ChatView.tsx` two arms (RO arm deps `[agentRunning]` resets on flips; scroll-event arm catches the no-geometry delayed revert from the caret mirror). 22 new model tests, 2052 total green, typecheck green.
- Smoke: `idle_typing_119` before t44 (relocation precedent; the BASELINE stash re-run also failed t44's focus steal — the flake is environmental). Legs: single/multiline/attachments/expand/delete + midtranscript (rAF per-frame exact scrollTop, 0 moved frames; max-card-during-ops guard — the ops end with a clear so a pre-vs-post compare is vacuous). 4/4 consecutive full-green runs of the stage.
- Crash isolation: victim now selected by `pidForSession(created.sessionId)` — the seeded stage spawns its own host; `hostPid` (most recent) killed the wrong one (the timeout's root cause). SIGKILL stage green in every run since.
- t28 `background running row stayed selected`: PRE-EXISTING environmental race on this machine, zero diff intersection — the ms1 background turn ends before the 10s probe starts (events tail `agent_end`; DOM: no active rows — selection correctly followed; run-dot correctly absent). The fail message was misleading (it names selection; the failing condition was the run-dot); a DOM dump was added to the fail path. Not fixed here — out of ticket-119 scope, documented for the smoke owner.
- Probe (`visual-t119-probe.ts` + index.ts/visual.ts wiring) deleted. Ticket 119 flipped to ready-for-human with the evidence chain.


## Review round (tip 2e2fbbd)

- Must 1: ticket flip committed to the branch (t128 precedent) — ready-for-human + Acceptance + Comments ride t119-idle-input.
- Must 2: test name CJK → 'return-to-bottom starts the next burst'. Must 3: ticket count corrected (9 it / 19 assertions; 22 = file total).
- Should 4: the fixture's CJK line disclosed as intentional (English comment). Note: +1 sub-pixel band commented in scroll-stay.ts.
- Edge (c)①: NOT a defect — the flip-to-idle observer's observe() initial broadcast re-arms an at-bottom reader (ResizeObserver semantics; empirically confirmed via the probe RO telemetry's initial entries at t=2732 with no geometry change). Recorded in the ticket Comments.
- Edge (c)②: REAL defect vs ticket 75 (own up-scroll ≤ cumulative shrink +1 within an armed burst gets pulled back to the bottom by the next re-pin; the quiet window only gates the scroll arm's gesture events, the RO arm has no gesture gate). Escalated to the main agent as a decision request; minimal fix = the wheel listener closes the idle sequence on deltaY<0 (symmetric with heldAway; covers the RO-during-window hole too; residual: scrollbar drag-up). Model untouched.
- vitest 2052 green, typecheck green, eslint: my 4 files clean (the 12 baseline error-lines unchanged with/without the diff).


## Edge-② adjudication round (tip 47801e7)

- Approved minimal fix applied: wheel-up (deltaY<0) closes the idle sequence immediately — even inside the cumulative-shrink bound (the observation cannot distinguish the gesture from the engine revert; the input event can). Model: closeIdleBottomSequence() = the existing disarmed transition (no new state-machine branch); ChatView wheel-listener glue calls it; return-to-bottom re-arms as ever.
- Tests +2: gesture close beats the bound (contrast case re-pins without it); post-close return-to-bottom re-arms + next shrink re-pins. 11 it / 23 assertions in the block, 24 in the file. vitest 2054 green, typecheck green, eslint: my files clean, repo baseline unchanged (12 error-lines).
- Ticket Comments updated: the adjudication record + the scrollbar-drag-up known boundary (no direction signal at pointerdown; past the bound the bound-break closes it — ticket 75's own coverage class).
