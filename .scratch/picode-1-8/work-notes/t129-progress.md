# t129 progress — thinking 行展开跨重挂载记忆（per-session 视图注册表）

**目标一句话**：把 ThinkingRow 的展开态从组件本地 state 提升到 per-session 视图注册表（`expandedThinking: ReadonlySet<entryId>`），跨设置跳转/会话切换/折叠往返全保留，会话期内存级；Worked 容器 expandedTurns 语义零改动。

## 阶段 = 开工（2026-09-22 03:42 +0800）

- 已读票面 129 + CONTEXT.md + spec R13（`.scratch/picode-1-8/spec.md` L91/L134/L149/L158）。
- 关键裁决：Q5=B——所有重挂载（设置跳转/会话切换/折叠往返）都保留展开态；1.6 旧裁决（容器展开跨切换不记忆）仅对 Worked 容器维持。
- 关键文件：`src/shared/session-registry.ts`（视图注册表）、`ThinkingRow.tsx`、`chat-reducer.ts`。

## 事件记录

- 2026-09-22 03:50 +0800｜设计定稿（未写码）：`expandedThinking: ReadonlySet<string>` 加在 **ChatState 内、expandedTurns 同层**（chat-reducer.ts）——ChatState 由 registry per-session 持有，即票面「per-session 视图注册表」的落点；toggle 动作 `toggle_thinking_expanded` 经 registry 现有 focused-session 路由（与 toggle_turn_expanded 同型）。**键 = TurnWorkItem 的 positional part key（`${turnId}-p${ordinal}`），非 owning entry id**：turn-collapse.ts 既有设计注记明示 ticket-51 backfill 在 message_end 重写 assistant entry id——按字面 entryId 键会在操作者实测场景（agent 运行中展开）的 message_end 瞬间丢展开态。positional key 即 React key，跨重挂载/回放/回填稳定（树路径前缀稳定）。证据：`src/shared/turn-collapse.ts` nextPartIndex 注释、`chat-reducer.ts` message_end `id: event.entryId ?? last.id`。
- 行为口径：history_loaded（replay）**保留** expandedThinking（spread 即得；1.6 重置裁决仅容器）；session_created（含 resume 重宣）经 initialChatState 重置=「新会话态」；折叠往返=ThinkingRow 卸挂重挂，集合在 chat state 不动。FollowView 用本地集合（read-only 视图沿 openTurns 先例），ChatView 用注册表。
- 实现面：chat-reducer（字段+动作+history 注记）、session-registry（动作路由）、ThinkingRow 受控化（props open/onToggle，删 useState）、TurnContainer/TurnWorkRows/AnswerBlock/ChatView/App 布线、FollowView 本地集合、session-registry.test.ts 表驱动、chat-reducer.test.ts 形状+行为、smoke.ts 新 stage（ticket-108 先例：seed 文件 + emitContractEvent 宣告 + A/B/C 三会话 + ⌘, 设置往返 + 侧栏行点击 A→B→A）。

（后续逐条追加）

- 2026-09-22 03:53 +0800｜实现落地：chat-reducer（expandedThinking 字段 + toggle_thinking_expanded 动作 + history_loaded 保留注记）、session-registry 路由、ThinkingRow 受控化、TurnContainer/TurnWorkRows/AnswerBlock/ChatView/App 布线、FollowView + SubagentChatTab 本地集合（第三消费者 SubagentChatTab 票 99——两处补齐）。typecheck 绿；chat-reducer.test 109 绿（+4：toggle 语义/positional key 抗 backfill/replay 保留 vs 容器重置/新会话重置）；session-registry.test 94 绿（+7：四行往返表 + no-op + replay 保留 + 重宣重置 + 新会话默认）。证据：`src/shared/chat-reducer.ts`、`src/shared/session-registry.ts`、`src/renderer/src/components/{ThinkingRow,TurnContainer,AnswerBlock,ChatView,FollowView,SubagentChatTab}.tsx`、`src/renderer/src/App.tsx`。

- 2026-09-22 03:56 +0800｜smoke 落地：`src/main/smoke.ts` 新增 ticket-129 stage（插入 ticket-108 之后、Quit 之前）——seed 三会话文件（smoke-129-a/b/c）+ emitContractEvent 宣告；A 展开思考行 → ⌘, 设置往返仍展开 → A→B→A 仍展开（B 隔离坍缩、容器态跨切换保持）→ 新会话 C 默认坍缩。npm test 全绿：117 文件 / 2001 测试；typecheck 绿。ps 自查无 Electron/PiCode 进程，开始跑 `npm run smoke:electron`。
- 2026-09-22 04:0x +0800｜第一次 smoke 跑死于 **ticket-75 段**（in-band hold did not latch）——任务书已知批次环境事实（75/88/90/93 跨分支资源争用偶发），与本 diff 零交集（scroll-stay 未动；我的 diff 仅思考行展开态）。wt-117-ime-scroll 的 dev app 于 3:58 启动与我的首次 smoke 并发（争用肇因）。杀掉重跑，等 wt-117 app 退出（约 6 分钟）后重启。证据：/tmp/t129-smoke.log（SMOKE FAIL ticket-75 stage: the in-band hold did not latch…）。
- 2026-09-22 04:1x +0800｜第二次 smoke（干净环境）通过 ticket-75/93 段，死于 **ticket-90 段**（live run never flipped to Running badge from the artifact）——同属已知偶发段，与本 diff 零交集（子代理桥/目录徽标未动）。证据：/tmp/t129-smoke3.log。
- 2026-09-22 04:2x +0800｜第三次尝试（run 4）发现多 worktree 并发：wt-122 的 electron smoke 与 wt-117 的 dev app 同时在跑（ps 佐证）——杀掉我的 run 4，等安静窗口（约 6 分钟后 QUIET）再跑 run 5。
- 2026-09-22 04:3x +0800｜run 5（安静窗口启动）通过 75/88/90/93/116/120 前段（nav_rail 全绿），死于 **ticket-120 段**（at the bottom with a live turn the focus tick is not the newest；dist:222）。零交集论证：该场景 transcript 全是文本回合（无 thinking part，ThinkingRow 根本不渲染）；scroll-stay/navigator-rail 零改动；无 effect 依赖/监听器/渲染计数变化。失败机理 = 四个 live 事件在负载下合并为一次 222px 增长，超出 160px STICK_THRESHOLD_PX 吸底带（src/shared/scroll-stay.ts:43），阶段自身对 IPC 合并时序敏感；跑 5 期间其他 worktree 的 app 又起（当时 6 个 electron 进程）。留档不追，等安静重跑。证据：/tmp/t129-smoke5.log。

- 2026-09-22 04:5x +0800｜A/B 实验定案：stash 我的 diff 后跑 **main 基线**，ticket-120 段同样确定性失败（同一 dist:222 / focused nl120-u3）——**该失败为 main 既有问题，与本 diff 无关**（A/B 证明）。stash pop 恢复。
- 2026-09-22 05:0x +0800｜run 8 死于 ticket-44（窗口焦点被抢——多 worktree 电子窗竞争）——本次死点早于我的 stage 位置。对策：把我的 stage **临时**移到最早稳定段（ticket-44 之前）跑 run 9。
- 2026-09-22 05:1x +0800｜**run 9：我的 stage 全绿** —— thinking_memory_{rows,expand,settings_roundtrip,switch,fresh_default,done} 六检查点全过：A 展开→⌘, 设置往返仍展开→A→B→A 仍展开（B 隔离坍缩、容器态保持）→新会话 C 默认坍缩。（run 9 后续 ticket-44 失败 = 临时移位的副作用：我的 stage 把焦点留在 C，扰动了后继阶段假设——终位在套件末尾无此问题。）已把 stage 移回终位（ticket-108 后、Quit 前，+253 行）。证据：/tmp/t129-smoke9.log。
- 2026-09-22 05:23 +0800｜终态验证：typecheck 绿；npm test 117 文件/2001 测试全绿。双轴自审（Standards + Spec）通过，详见票 Comments。准备提交。
- 2026-09-22 05:3x +0800｜visual:thinking 全绿（th1 坍缩/th2 **展开**（open:1，受控布线端到端验证）/th3 落定冻结；帧复原未提交——内容与像素无差，仅计时噪声）。截图：/Users/liaokechen/PiCode/.worktrees/wt-129-thinking-memory/.scratch/visual/th2-thinking-expanded.png。
- 2026-09-22 05:4x +0800｜**终态**：分支 t129-thinking-memory 两提交——`0cc7f5c`（feat：实现+测试+smoke stage，12 文件 +652/−14）+ `b7476f5`（chore：票翻 ready-for-human + 自审/证据 Comments，即分支 tip）。工作树净；票文件随分支提交；本 progress 文件按铁律保持 untracked（存主仓 .scratch，不在本 worktree 内）。
