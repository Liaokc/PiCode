# PiCode 1.4 — SDK 0.85.1 对齐 × 空态命令目录 × Composer 自适应 × fork live 修复 × 回合正文分割 × 代码卡标签

Status: ready-for-agent

本 spec 覆盖工单 48 起（同目录 `issues/`，编号全局连续）。取证 = 操作者 2026-09-08 真实使用报痛 5 条 + 实拍五帧（已归档 `.scratch/compare/`：`pi14-*`）+ main 源码逐项核因 + 会话库只读取证（fork 时序 / 回合结构 / 围栏标签）+ ZCode bundle 只读行为取证（参数校准用后即弃，未复制任何资产）；全部取舍经 /grill-with-docs 两轮十三问（Q1–Q13）定稿（全记录见 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。

## Problem Statement

1.3 验收后的真实使用判定——功能面完整，但**五处日用手感与一处版本卫生欠账**：

- **空态命令断供**：New Task 敲 `/` 是死菜单（"No matching commands"）——模板与技能明明存在，发完首条消息才出现。
- **长文本盲写**：composer 固定 ~74px 高内部滚动，粘贴长 prompt 看不到全文，也没有任何放大输入区的供面（两处 composer 皆然）。
- **新会话 fork 必炸**：点回复的 Fork，"Forked to a new session." 与 "Invalid entry ID for forking" 双 toast 并存，fork 实际失败——只有 resume 过的会话能 fork。
- **叙述墙淹答案**：长任务回合的正文是工具调用间的一整墙过程叙述（"三个问题，逐一修复…"），最终答案被淹没；ZCode 只显最后一个文本块。
- **代码卡哑标签**：无语言 tag 的围栏块左上角空白，不知道框是什么类型；ZCode 回退显示 text。
- **版本漂移**：内嵌 SDK 0.84.3 落后全局 pi（现为 0.85.1）两版——ADR-0005 的受控升级窗口到了。

## Solution

六项需求（R0 前置 + R1–R5），全部对齐实证参照（ZCode 实机行为参数 / 会话库证据）：

0. **SDK 对齐升级票（R0）**：三段式——侦察（0.84.3→0.85.1 changelog 与 API 面清单）→ **操作者检查点**（清单拍板后才动代码）→ 实施（升锁 0.85.1 + 适配 + 互通冒烟 + 全门禁）。W1 先行。
1. **空态命令目录（R1）**：auth-probe 扩展 resourceLoader 枚举模板+技能（带 cwd，切换目录防抖重探）；空态 `/` 菜单列真实命令（不含 /compact 与退役六条）；点选插入命令文本。
2. **Composer 自适应（R2）**：自动增高 74→160px（ZCode 校准）+ 输入卡右上角常驻展开钮（约半屏原位展开，Esc/再点/发送收回，无快捷键）。
3. **fork live 修复（R3）**：host 事件回填真实 entry id（live 路径 fork 从此可用）+ toast 改 ack 制（成功仅在确认后，失败只报错）。
4. **回合正文分割（R4）**：ZCode 同型——每回合仅最后一个文本块作正文，之前叙述归 Worked 容器，之后工具常显正文下方；ChatView 与 FollowView 同规则。
5. **代码卡标签回退（R5）**：裸围栏回退显示 `text` 标签，最小对齐。

## User Stories

### R0 SDK 对齐

1. As an operator, I want the embedded SDK pinned to 0.85.1, so that PiCode matches the Pi TUI I actually run.
2. As an operator, I want a recon report of every 0.84.3→0.85.1 API and behavior change before any code moves, so that I approve what adapts.
3. As an operator, I want a checkpoint to discuss the recon findings, so that upgrade scope is my decision, not the session's.
4. As a handoff user, I want the TUI↔PiCode interop smoke to pass on 0.85.1, so that sessions open on both sides without format drift.
5. As an operator, I want a re-checkpoint if npm moves past 0.85.1 mid-batch, so that the target never shifts under me.

### R1 空态命令目录

6. As a new-task starter, I want the `/` menu to list my prompt templates before any session exists, so that I can start with a template directly.
7. As a new-task starter, I want the `/` menu to list my skills before any session exists, so that skills are discoverable from the empty state.
8. As a new-task starter, I want /compact absent from the empty-state menu, so that every command I see is actually runnable.
9. As a hygiene-minded user, I want the six retired built-ins to stay out of the empty-state menu, so that menu hygiene holds everywhere.
10. As a new-task starter, I want picking a command to insert its text into the composer, so that I keep review-before-send control.
11. As a multi-project user, I want the empty-state command list to follow the selected working directory, so that project-level skills and templates are accurate.
12. As a fast typist, I want the command list to refresh (debounced) when I switch the New Task directory, so that the menu never lies about availability.
13. As a keyboard-first user, I want the empty-state menu to keep type-to-search and arrow navigation, so that command selection stays in flow.
14. As a minimal-setup user, I want a truthful empty menu when no templates or skills exist, so that absence explains itself instead of crashing.

### R2 Composer 自适应

15. As a long-prompt writer, I want the input area to grow as I type up to a calibrated cap, so that I see more of my draft without any action.
16. As a layout-minded user, I want growth to stop at 160px with internal scrolling, so that the composer never swallows the transcript.
17. As a long-prompt writer, I want a persistent expand button at the composer card's top-right, so that a bigger writing surface is always one click away.
18. As a draft writer, I want expansion to open in place at about half the chat area height, so that draft and transcript stay contextually stacked (no overlay).
19. As a keyboard user, I want Esc to collapse the expanded input, so that reverting is instant.
20. As a sender, I want the expanded input to collapse after my message sends, so that the next turn starts from the normal composer.
21. As a toggler, I want re-clicking the button to collapse, so that the control is self-evident.
22. As a tooltip reader, I want the icon-only button to show "Expand input" on hover, so that it explains itself (no shortcut, per tooltip discipline).
23. As a new-task starter, I want the same auto-grow and expand behavior in the empty state, so that both composers feel identical.
24. As a smoothness-minded user, I want height changes without per-keystroke jank, so that typing stays fluid.

### R3 fork live 修复

25. As a brancher, I want Fork on an assistant reply to work in a brand-new session, so that branching never requires a resume dance.
26. As a brancher, I want the success toast only after the fork actually lands, so that "Forked to a new session" always tells the truth.
27. As a brancher, I want a clear error toast when a fork fails, so that failure is visible and actionable (no double toast).
28. As a brancher, I want a forked session to carry the exact transcript up to the fork point, so that the branch is faithful.
29. As a brancher, I want fork on resumed sessions unchanged, so that the working path never regresses.
30. As a cautious user, I want Fork during a running turn to stay a silent no-op, so that mid-run forking can't corrupt state.
31. As a tree user, I want fork from the history tree unchanged, so that its working real-id path is preserved.

### R4 回合正文分割

32. As a long-session reader, I want each settled turn to show only its final text block as the answer, so that conclusions aren't buried under narration.
33. As a long-session reader, I want mid-task narration folded into the Worked container, so that the settled transcript reads question → work → answer.
34. As a live watcher, I want the container to stay open while the turn runs, so that I can follow the work as it happens (unchanged).
35. As a settled reader, I want the container collapsed when the turn ends, so that finished turns stay calm (unchanged).
36. As a transcript-order purist, I want tools that ran after the final text to stay visible below the answer, so that sequence truth is preserved.
37. As a follow-mode user, I want the same split in Live Follow, so that watched sessions read identically to local ones.
38. As an error-reader, I want errored turns to stay expanded, so that failures remain fully inspectable (unchanged).
39. As a brancher, I want the fork anchor to stay on the last text-bearing entry, so that AnswerBlock branching semantics don't shift.
40. As a streaming reader, I want the in-flight text tail to keep streaming visibly as the answer, so that live output never hides.

### R5 代码卡标签

41. As a code reader, I want untagged fenced blocks to show a "text" label, so that every code card declares its type.
42. As a visual scanner, I want tagged blocks' labels unchanged, so that existing recognition doesn't shift.

### 横切

43. As an operator, I want additive contract increments reported at implementation time, so that the contract ledger stays honest.
44. As an English-UI stickler, I want all new copy in English, so that the interface-language constraint holds.

## Implementation Decisions

- **R0 三段式**：① 侦察——diff 0.84.3→0.85.1 的 changelog 与 API 面（host/renderer 消费的 SDK 接口、SessionManager/entry 语义、会话格式兼容性），产出改动清单；② **操作者检查点**——清单给操作者过目拍板后才动代码（操作者明言"具体有什么改动需要和我讨论"）；③ 实施——依赖升锁 0.85.1 + 适配 + 互通冒烟（TUI↔PiCode 同会话打开）+ 全门禁。实施时若 npm 已越过 0.85.1，回到检查点重新拍板。执行 ADR-0005 既有政策，无新 ADR。排期 **W1 先行**。
- **R1 空态命令目录**：probe 短命 host 进程扩展 **resourceLoader 枚举**（prompt 模板 + 技能投影，无会话机制）；probe 增 **cwd 参数**，main 层按 New Task 所选目录**防抖重探**并缓存（每目录一次）；**契约增量** = probe 报告增命令目录字段（additive，实施时报备）；空态 chat 的命令清单消费该目录——菜单搜索/↑↓ 导航沿用现组件；**点选 = 插入命令文本**（与 in-session 同一路径），首条消息送达时由 SDK 解析；`/compact`（会话域）与退役六条**不进**空态目录。ZCode `appSlashCommands` 同型先例。
- **R2 自适应**：自动增高 = **纯投影**（内容 → 高度钳制 [74px, 160px]，scrollHeight 测量 + 节流，禁逐帧 setState）；**展开钮** = 输入卡**右上角常驻**图标钮（操作者拍板位置；ZCode 无此钮，属操作者批准的偏离），tooltip 只显短描述 "Expand input"，无快捷键；展开高度 = 主区约一半（钳制 [280px, 560px]），**原位下推转录**（非浮层）；展开态 = 组件本地状态（不持久化）；**收回 = 再点 / Esc / 发送成功后**。两处 composer（New Task / 会话内）共组件自动同享。
- **R3 fork 双修**：**契约增量** = user_message / message_end 事件增真实会话条目 id 字段（additive，实施时报备）；host 在条目落盘时回读真实 id 填入事件；reducer **有真实 id 则采用，缺席回退合成 id**（健壮性，被中止回合等场景）；`handleFork` **废除无条件乐观成功 toast**——成功 toast 挂在 fork 后的会话公告到达时，失败走既有 session_command_error 错误 toast；requireSettledSession 静默拦截**维持不变**（运行中 fork 静默无提示，范围外）。
- **R4 分割规则**：groupTurns（三面共享纯模型）改为——**正文 = 回合最后一个文本 part**（位置规则，非语义判定）；更早文本 part 成为 **work item 新类别（过程叙述）**，随容器折叠（容器展开时按 work 行渲染可见）；**正文之后的工具行作为常显段渲染在正文下方**（转写顺序，ZCode 对齐）；live 容器自动展开 / 结算收起**不变**；错误回合保持展开**不变**；fork anchor = 最后文本 part 所在 entry（与现状"最后文本承载 entry"语义等价）；**ChatView 与 FollowView 同规则**（Q10a：共享模型零开关）。ZCode 分段算法（`Ant`/`Tnt`）为行为标定参照。
- **R5 标签回退**：代码卡语言标签 = 语言缺失时回退 **text**（`language?.trim() || 'text'`，ZCode 同型）；卡片其余 chrome（wrap/copy）不动；**不加文件图标**（最小对齐）。
- 术语随票入 CONTEXT.md：「回合正文（Turn Answer）」「过程叙述（Interim Narration）」「输入展开（Composer Expand）」——措辞见 `intake-grilling.md`。UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定输入快照/契约事件/坐标，断言状态与可见输出；不测内部调用序列、不测 CSS 字节。
- **零新缝**，全落既有四缝：
  - **Seam-1 表驱动 vitest**（本批 5 个纯模型族）：R1 probe 报告→空态菜单行投影（含 cwd 维度、compact/退役排除）；R2 高度投影 + 展开状态机（74→160 钳制 / 展开 280–560 / 收回三路）；R3 reducer 真实 id 采纳/回退用例；R4 groupTurns 分割决策表（最后文本块 / 过程叙述 / 后续工具 / 流式尾 / 错误回合 / 无文本回合）；R5 语言回退投影。先例：chat-reducer、fold-model、pane-motion、navigator-rail、slash-gate、new-task-models 套件。
  - **host-contract smoke**：R0 新增互通冒烟阶段（TUI 0.85.1 ↔ PiCode 0.85.1 同会话打开互续）；R1/R3 契约增量到时报备入账（既有惯例）。
  - **electron smoke**：R1 空态 `/` 列真实命令 + 点选插入 + /compact 不在列；R2 输入增高/展开/Esc 收回/发送自动收回断言；R3 **新会话 fork 成功且恰好一条成功 toast**（user_message 观察者证零垃圾回合）；R4 长回合结算后正文仅尾块、叙述在容器内、正文后工具在下方；R5 裸围栏现 text 标签。
  - **visual harness**：R2 展开态帧；R4 长回合结算帧（复现 pi14-narration-in-answer 场景验证修复）；R5 裸围栏帧（对照 pi14-untagged-codeblocks）。
- 性能红线：R2 增高测量节流（禁 per-keystroke 抖动）；R4 纯模型改动零额外转录重渲染（票 30/46 memo 基建先例）。

## Out of Scope

- `/compact` 及其它会话域命令进空态菜单（保持会话内专属）。
- 四个快捷 chips（Weekly Report 等）接真实模板数据——维持装饰性（另立需求才动）。
- 展开钮快捷键（后续可加）；composer 拖拽 resize 手柄。
- 运行中 fork 的任何提示或语义变化（静默维持）。
- ZCode 代码卡文件图标、mermaid 预览等高级块（仅对齐标签回退）。
- Worked 容器内过程叙述的排版精修（按 work 行基础渲染即可）。
- SDK 越过 0.85.1 的升级（新版本 → 重走 R0 检查点，另立票）。
- 深色主题（持续范围外）。

## Further Notes

- **取证链**：两轮十三问全记录与 file:line 级根因见同目录 `intake-grilling.md`；实拍五帧 `pi14-*` 在 `.scratch/compare/`；会话库证据（fork 时序：20:48 失败无文件 / 20:49 子会话 parentSession 全量克隆；01a0801b 回合结构；01a057f5 entry#239 裸围栏）；ZCode bundle 只读校准参数：composer 自动增高 40→160px（min-h-10/max-h-40）、分段规则=最后文本块、代码卡 text 回退、appSlashCommands 先例、fork.failed 文案先例——用后即弃，未复制任何资产。
- **工单依赖提示（/to-tickets 用）**：R0 先行 W1；**R1/R3 在 R0 合入后开**（probe/resourceLoader 与 host 事件面踩 SDK）；R2/R5 纯 renderer 可与 W1 并行；R4 建议 R0 合入后开。R1 与 R3 各自 additive 契约增量、contract 与 host 文件邻接——/to-tickets 裁量串行或验证区段不相交。
- **操作者待办**：`scripts/merge-ticket.sh:50` ls-files 补 `picode-1-4`（勿再绕）。全局 Pi Agent 已升级 0.85.1（2026-09-09 实查）。
- **ADR 检查**：无新 ADR——R0 执行 ADR-0005 既有政策；R4 为可逆的纯函数显示规则修订；R2 展开钮为操作者批准的 ZCode 偏离（记录在案，非 hard-to-reverse）。

## Comments

- 2026-09-09 (requirements intake): 十三项决议全部经 /grill-with-docs 两轮十三问定稿——Q1 空态菜单内容 / Q2 probe 扩展数据源 / Q3 点选=插入 / Q4 自动增高+展开钮（操作者指定偏离 ZCode）/ Q5 fork 双修+运行中静默 / Q6 参照 ZCode 分割 / Q7 FollowView 现场解释后 Q10 拍板同步 / Q8 text 回退 / Q9→Q13 升级票三段式+先行排期 / Q11 后续工具常显下方 / Q12 展开钮六子项（位置=右上角为操作者改判）。全记录：`intake-grilling.md`。
- 2026-09-09 (缝确认)：零新缝零新契约面增量外无扩张，全落既有四缝（Seam-1 表驱动 / host-contract smoke / electron smoke / visual harness），已向操作者报备，复触发 /to-spec 视为无异议。R1（probe 报告）与 R3（事件 id 字段）为 **additive 契约增量**，按惯例实施时报备。
- 2026-09-09 (分类记录)：缺陷 3（R1 空态断供、R3 fork 潜伏缺陷+toast 语义、R5 标签回退）、全新需求 2（R2 自适应、R4 分割规则）、流程性前置 1（R0 SDK 对齐）。
