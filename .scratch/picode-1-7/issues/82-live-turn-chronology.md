# 82: live 回合纯时间序——流式单流、无提升轮换

**What to build:** 流式回合的渲染改为**纯时间序单流**：全部 assistant 文本块按发生顺序内联于工具/思考行之间、随容器流式展开——不再把「最新文本块」提升为临时正文、不再有下一个文本块开始时的降级灰化轮换、live 期无常显段。**落定态维持现状**（最终回合正文在容器下方 + 容器折叠——ZCode 构图不变）；挂起审批卡内联于其工具将现之位；ChatView 与 FollowView 同规则。

**背景（取证）：** 现行为 = 票 56 提升规则（最新文本块 = 临时正文提至容器下方 + 常显段，`turn-collapse.ts` 分组 + chat-reducer 新文本块重划分）；操作者实拍（pi17-container-collapsed/-expanded）——「过程中的正文在最上方显示…展开后才是时间顺序…我希望全部都按照时间顺序」。ZCode 构图（落定态）不动；本票只改 live 语义。**CONTEXT.md 词条 rider**：「回合正文/常显段/过程叙述」的 live 语义随票修订（提升与常显段仅存在于落定态），落定定义不变。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] Seam-1 表驱动：live 回合分组 = 纯时间序（文本块内联、无临时正文、无常显段、无重划分），落定分组与现状逐字节同构（含答案位置/常显段/容器折叠）
- [x] 挂起审批卡在 live 流中占其工具将现之位（内联、两态零跳变语义保持）
- [x] electron smoke：流式回合文本块按序内联、无灰化轮换；agent_end 落定后构图与现状一致
- [x] FollowView 同规则验证
- [x] CONTEXT.md 三词条修订随票入册（本会话只写 .scratch——词条草案在 `../intake-grilling.md`，实现票落地）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案

## Comments

- 2026-09-17 (implement, t82-live-chronology): 落地完成。**纯投影零契约增量**——改动全在 renderer 投影层：
  - `src/shared/turn-collapse.ts`：`groupTurns` 拆分前置 liveness 判定——live 回合（agentRunning 时最后一个 draft）走新 `chronologicalTurn`：全部 raw items 按转写顺序原样进容器（文本块成为新 `TurnWorkItem` kind `'text'`，正文同款 markdown 渲染、带 streaming 旗标），answer=null、afterAnswer=[]、append-only 无重划分；落定回合仍走票 53/56 的 `splitTurn`（agent_end 一次定稿，形状与现状逐字节同构）。pending 审批 pill 在 live 期就在容器流内其工具将现之位（reducer 原位转换语义不变——pill 与 tool 同 entry id 同位，两态零跳变）；pendingApproval 对 live 流全域生效（手动折叠不吞 gate ask）。落定回合的 pendingApproval 规则不变（常显段内 pill 不强开容器）。
  - `TurnContainer.tsx`：`TurnWorkRows` 新增 `'text'` case → memo 化 `StreamTextRow`（`.msg.turn-stream-text` 包裹 `Markdown`）——静态流文本块不随 delta 重解析（R15 性能红线：流式路径渲染次数不增，只有 streaming 尾块重解析，与旧 answer 一致）。
  - CSS：`.msg-assistant .md` 系排版规则（7 组）改 `:is(.msg-assistant, .turn-stream-text) .md` 共享给流文本块；新增 `.turn-stream-text` 块规则。**刻意不复用 `msg-assistant` 类**——保持 smoke/visual 探针 `.msg-assistant .md` = 「容器外落定正文」语义纯净（92/94/97 后续接缝）。
  - FollowView 同规验证：FollowView 恒走 `groupTurns(entries, false)`（回放即落定态）——落定规则不变即 FollowView 不变；vitest 回放同构测试全绿。NavigatorRail live 期 replyText 如实为空（无 answer 可预览，落定即现）；新增 vitest 断言。
  - CONTEXT.md 三词条修订入册：回合正文/常显段/过程叙述 live 语义移除（提升与常显段仅存在落定态，live = 纯时间序单流）+ 工作容器词条容器体收纳规则补票 82 live 语义。落定定义不变。
  - handler 留缝：`fileChanges` 聚合公式与 `TurnGroup` 形状不动（92 文件条 settled-only 在其上收窄）；scroll-stay / 用户泡块未触碰（94/97 接缝完好）；契约零改动。
  - 测试：turn-collapse 表驱动新增 8 项（live 纯时间序 / settle 转换同构 / 无重划分×2 / pill 内联槽 / 两态一槽含落定段 / live 文件聚合）+ 改写 5 项 live 形状断言；`npm test` 1467 全绿、typecheck 全绿。
  - electron smoke：全套 `npm run smoke` 阶段 1–5 绿；stage 6 electron smoke 完整通过（首跑 ticket-59 mermaid 焦点抢夺环境性 flake——无人值守跑真剪贴板阶段的 `app.focus({steal:true})` 偶发失败，与本票无关；复跑全绿）。**更新后的 turn_chronology 阶段四探针全过**：live 内联单流（`turn_chronology_live_inline_ok`）、两态一槽零跳变（top 296→296）、思考内联于工具下（`turn_chronology_live_thinking_inline_ok`）、落定构图与现状一致（`turn_chronology_settled_same_position_ok`）。answer_split / worked_container / turn_filebar / scroll_stay / nav_rail 全绿（落定态无回归）。
  - visual chronology harness（R15 live/落定两态帧）重写为票 82 语义并断言通过：`tc1-live-stream-inline` / `tc2-tool-same-slot` / `tc3-live-stream-thinking` / `tc4-settled-same-position`（对照 pi17-container-*，截图 `/tmp/picode-t82-visual/`）。
  - dev-app serialization：跑 smoke/visual 前 ps 自查通过（仅操作者已装 app 及其 session host，无其他 dev app/smoke 进程）。注：agent 会话环境带 `ELECTRON_RUN_AS_NODE=1`，跑 electron smoke/visual 需 `env -u ELECTRON_RUN_AS_NODE`（否则 stage 6 以 plain node 启动）——环境注记，非代码问题。
- 2026-09-17 (code-review + fixes): **评审通道注记**：/code-review 的双轴并行子代理两次启动失败（"async runner did not produce a pid for cwd"——本会话宿主于 Electron app 内，子代理启动器不可用；同协议重试一次同样失败，未私自切换启动机制）→ 退化为父会话内双轴自审（standards × spec，已在下述修复中体现）。
  - **Standards 轴发现与处置**：① AnswerBlock 文档残留 pre-82 措辞「streamed live」与 SETTLED-STATE ONLY 句自相矛盾——已改；② CONTEXT.md「回合文件条」词条仍写「常显段末尾/live 与落定同构」——**有意不动**（92 文件条 settled-only 的 rider，票内已注记接缝）；③ CSS `:is()` 扩展 7 组规则为共享排版的最小形（复用 `msg-assistant` 类会污染探针语义，弃）；④ 基线 smell 扫描无实质项（chronologicalTurn 与 splitTurn 形状不同非重复；smoke/visual SIG 镜像为仓库既有惯例）。
  - **Spec 轴发现与处置**：① electron smoke 只断言了「按序内联」，未流式第二个文本块验证「无灰化轮换」（验收项缺口）——已补：smoke turn_chronology 阶段增第二回合 text→tool→text 场景（append-only 断言 + 两文本间工具 idx 1 + 落定后 answer=末文本、fold 内时间序 narration+tool）+ visual chronology harness 增 tc5 两帧（同场景，无人值守可跑）；② NavigatorRail live 期 replyText 变空——模型变更的必然投影（live 无 answer），如实、已加测试锁定，非 scope creep；③ 零契约增量复核 ✓（contract.ts 零改动）；④ 接缝复核 ✓（fileChanges 公式/scroll-stay/用户泡块未动，`.msg-assistant .md` 探针语义保持）。
  - **环境注记**：无人值守跑 electron smoke 会在 ticket-44/59 真剪贴板阶段死于 macOS 15 焦点窃取拒绝（代码内已注释的已知约束——操作者正于他应用打字时 `app.focus({steal:true})` 不可得）；与本票无关，卡位在本票阶段之前。无碰撞复跑一次仍同样失败；run#2（15:38）曾全绿含 ticket-44/59。turn_chronology 阶段本体不依赖焦点——操作者间歇停手时全套即可过。⑤ 无轮换探针已由 visual chronology tc5 在真 DOM 上验证全绿（tc1–tc5 + 落定帧，截图 /tmp/picode-t82-visual/）。
- 2026-09-17 (merge session，per 操作者验收指令「82 工单已验收」)：Status 翻转 ready-for-human + 六项验收框按 Comments 既有证据链勾选（实现 f539908 / 评审修复 a630859 / 评审注记 20fa3e7 / 视觉帧 41fc890）；CONTEXT.md 三词条 + 工作容器 rider 经合并会话在分支 diff 中核实已入册。electron smoke 证据 = Comments run#2（15:38）全绿 + turn_chronology 四探针全过。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
