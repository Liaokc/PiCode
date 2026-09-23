# PiCode 1.8.0 批次 run-log（主 Agent 生存机制）

## §0 主 Agent 指南（compact 后先读这份：角色/模型分配/流程/红线压缩版）

**角色**：主 Agent（批次自治驱动者），运行在终端 Pi Agent、~/PiCode 仓库根。只做编排、派工、验收协调、合并驱动与记录，不直接写业务代码。操作者只发了一条启动消息，之后不参与。

**落库铁律**：任何不可逆动作（派工/翻状态/合并/评审结论/关键决策）执行前先把记录写进本文件（先落库、后行动）。恢复工作唯一入口 = 重读本文件 + session-prompts.md，绝不依赖会话记忆。

**模型分配**：
- 主 Agent + 除 122/128 外全部实现 subagent（含 134）：bella-local/GLM-5.3（256k，compact 生存靠 progress 文件）
- 票 122 与 128 实现与评审 subagent：bella/GLM-5.3-flash（1M）
- 全部 subagent thinking = Max
- 合并 subagent：bella-local/GLM-5.3，短任务不占开发并发名额

**票清单**：116–134 共 19 张，在 .scratch/picode-1-8/issues/。票面 Blocked by 已全合并才可开工。同文件群强串行：116→117→118 绝不并行。票 134 最后实现（W6，116–133 全合并后），验证要带批次全部修复启动 PiCode。

**波次顺序**：W1→W5→W6→收尾（具体波次表见 session-prompts.md，派工文本以其为准）。

**每票流程**：
1. 建工区：worktree + 分支（.worktrees/wt-<NN>-<slug>，分支 t<NN>-<slug>），ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install（不受 serialization 限制）。建好即落库。
2. 派实现 subagent（并发上限 3）：cwd=worktree，任务文本 = 手册该票 prompt 块 + subagent 通用附加条款四条（A 落库铁律 t<NN>-progress.md；B 评审策略双轴/self-review；C serialization ps 自查；D 完成口径翻 ready-for-human+记 sha+报告完成）。
3. 验收协调：核对票 Status=ready-for-human、Comments 有 sha、分支有提交。失败→修复轮（附失败记录），同票最多 3 轮，仍败挂起（票 Comments 记原因）。
4. 派合并 subagent（根工作区 ~/PiCode 执行 bash scripts/merge-ticket.sh <NN>）。收到 merge sha → run-log 记账 → 广播「main 已推进」→ 检查下一票阻塞是否解除。
5. 循环直至 19 票全合并。

**红线**：
- 不碰 main 上的 src/：main 写入仅限 ①基线 tag ②merge-gate 补丁（若缺才补，一处）③合并 subagent 跑脚本
- 不 push、不打 v1.8.0 tag、不 release、不删任何 worktree
- additive 增量（票 128 reorder_queue_entry）实施时报备入 host-contract smoke；UI 文案全英文
- 机制性失败先读 pi-subagents guide 校准重试；仍败降级（并行转串行/评审转 self-review）并记录，绝不静默放弃整批。唯一例外 = spawn 可用性自查失败（停下报告操作者）
- 122/128 若 z18-* 帧缺席：按票内文本规格实施，Comments 标注「样式保真未对照参照帧验证」，总报告列操作者目检项

**开工自查清单（全绿才派第一票）**：
⓪ spawn 可用性自查（最小 spawn 验证；失败先校准，仍败停下报告）
① 基线 tag picode-1-8-base（缺失则打在 main）
② merge-gate 补丁：scripts/merge-ticket.sh ~L50 ls-files 列表已含 ".scratch/picode-1-8/issues/${NN}-*.md"（缺才补，单独提交 main）
③ 根工作区 ELECTRON_MIRROR=... npm install（捆绑 SDK 必须 0.86.1）
④ 记录 .scratch/compare/ 的 z18-* 四帧有无（zcode-provider-card / zcode-thinking-brain / zcode-queue-1 / zcode-queue-2）
⑤ git worktree list 无残留；记录 main HEAD；建 work-notes/ 目录

**收尾**：19 票全合并后根工作区全量回归（vitest 全套 + smoke:host + smoke:electron，遵守 serialization，electron 20 分钟级）。产出批次总报告（会话回复 + 追加本文件）：
① 每票一行：分支 sha / 合并 sha / 评审方式 / 验收结果 / 轮次与异常
② 122/128 样式保真项与 z18-* 帧有无
③ 票 134 双因子定位记录与修复要点（操作者 Finder/Dock 实启确认步骤单独列出）
④ 挂起票与原因
⑤ 环境状态（node_modules / worktree 清单）与遗留风险
完成后停下等操作者。不自行打 tag、不 release。

## §1 状态账本

| 票 | 波次 | 状态(planned/wip/review/merged/parked) | 轮次 | 分支sha | 合并sha | 评审方式 | 异常 |
|-----|------|------|------|------|------|------|------|
| 116 | W1 | merged | 1 | b194bd5 | d0a6be5(sync 720e5d0) | 主Agent双轴(均 pass-notes) | rebase 票文件两笔冲突取一致侧；smoke.ts additive 双向保全；双轮验证绿 |
| 117 | W1 | merged | 1 | 9ce35c8(实现 07d2722) | 87d745c(sync 12ffee1) | 主Agent双轴(均 pass-notes) | rebase 零冲突；t120 pacing 修复保全核验；双轮验证绿 2034 |
| 133 | W2 | merged | 2 | 1a79e45 | d4a436a(sync 8273924) | 主Agent双轴+修复轮 | smoke.ts 两处冲突逐 hunk 双保（t133 stage 终位 thinking_memory 后）；翻票/轮记录判空丢弃属正常；双轮验证绿 2074 |
| 131 | W5 | merged | 1 | 2a2b9d7 | 8cc4fae(sync a663bae) | 主Agent双轴(双 pass-notes) | 仅票文件冲突取 tip 侧；翻票提交判空丢弃正常；smoke/contract/host-contract 自动；双轮验证绿 2081 |
| 118 | W1 | merged | 1 | d485018 | 961f560(sync 7b6353a) | 主Agent双轴(均 pass-notes) | rebase 票文件两笔取 tip 侧；smoke/Composer/CONTEXT/commands 自动；双轮验证绿 2055 |
| 120 | W1 | merged | 1 | 5e43a3e | 3b0abc2(sync 8c3675a) | self-review→主Agent双轴(standards pass-notes/spec pass) | ticket-90 smoke 预存在失败(跨分支/base A/B)；rebase 票文件冲突已解(树与 tip 逐字节一致) |
| 121 | W1 | merged | 1 | 7391a91 | 5cf8732(sync 8ac237a) | 主Agent双轴(均 pass-notes)+parity 实证过 | 无（rebase 干净，双轮验证绿） |
| 122 | W3 | merged | 1 | 6ee9e2d | 44a1053(sync 5d17eb4) | 主Agent双轴(均 pass-notes，flash) | rebase 仅票文件冲突取 tip 侧；smoke.ts +254 纯增量/app.css cascade 两 hunk 自动；双轮验证绿（含一次偶发抖动复跑两次全绿）；z18 目检帧已入 main |
| 124 | W3 | merged | 1 | caedff8 | 1a10678(sync e151e05) | 主Agent双轴+修复轮 | rebase 票文件两笔取 tip 侧；smoke.ts/app.css 自动；双轮验证绿 2027 |
| 123 | W1 | merged | 1 | 40e7d45 | 391bad7(sync 1a2f2df) | 主Agent双轴(均 pass-notes) | 自身阶段 r1+r3 双绿；两条 harness 异常留档 |
| 125 | W2 | merged | 1 | c631544 | dbdb52a(sync 5120e7c) | 主Agent双轴+修复轮 | 预检 dirty 处置（visual-t125 临时移出/移回零删除）；双轮验证绿 2043 |
| 126 | W1 | merged | 1 | 9f6d6f4 | 94653cf(sync a84c9d0) | 主Agent双轴(spec pass-notes/standards pass) | 无（rebase 干净，双轮验证绿） |
| 127 | W1 | merged | 1 | f0b11b1 | 6a20aa4(sync 5debc09) | 主Agent双轴+帧修复轮 | rebase 票文件两笔冲突取 tip 一致侧；双轮验证绿 |
| 128 | W4 | merged | 1 | f5f41e7 | 93a1646(sync b8ab012) | 主Agent双轴+修复轮 | rebase 票文件一笔取 theirs；smoke/Composer/App/contract/host-contract-smoke 全自动；双轮验证绿 2074 |
| 129 | W2 | merged | 1 | b7476f5 | a64cac1(sync 6b327dc) | 主Agent双轴(均 pass-notes) | 键粒度偏离裁决接受；rebase 零冲突；双轮验证绿 2020 |
| 130 | W3 | merged | 1 | e6db7fb | 367c723(sync 9ca9952) | 主Agent双轴(均 pass-notes) | rebase 票文件取 tip 侧；smoke.ts/parse.ts 自动；双轮验证绿 2052 |
| 119 | W4 | merged | 3 | 47801e7 | 9d3b474(sync d095282) | 主Agent双轴+两轮修复 | rebase：smoke.ts doc 一处 hunk 双保（t119 段接 t117 段，四 stage 齐全验证）；scroll-stay/ChatView/tests 字节一致；双轮验证绿 2092 |
| 132 | W5 | merged | 1 | 43aade9 | be105d9(sync 0f939b1) | 主Agent双轴(双 pass-notes) | 仅票文件冲突取 HEAD（=分支 tip 终态）；smoke 等 5 文件自动纯 additive；双轮验证绿 2101 |
| 134 | 最后 | **merged（批次收官）** | 1 | 2da49a6 | 331922e(sync db58fcd) | 主Agent双轴+修复轮 | 仅票文件冲突×2 取 ours（=tip 字节一致）；smoke.ts/package.mjs/run-all.sh 全自动；双轮验证绿 2153 |
| 134 | W6 | planned | 0 | - | - | - | - |

（波次列为初始猜测，以 session-prompts.md 波次表为准，装载上下文后修正）

## §2 事件流水（append-only，一行一事带时间戳）

- 2026-09-22 01:46 run-log.md 创建，§0 主 Agent 指南落库落成
- 2026-09-22 01:48 [装载] session-prompts.md + spec.md 已读：波次表 W1(116→117→118串行·120·121·123·126·127) W2(129·130·133·125) W3(122←121·124) W4(119←117·128) W5(131·132) W6(134←116-133全合并)；派工 prompt 模板齐全
- 2026-09-22 01:48 [装载] AGENTS.md（已在项目上下文）+ merge-ticket.sh 全文 + pi-subagents SKILL.md 已读；merge 流程=根工作区跑脚本（rebase+merge --no-ff+verify）
- 2026-09-22 01:49 [装载] models 查询：bella-local/GLM-5.3（本会话模型）与 bella/GLM-5.3-flash 均在注册表 ✓；全部 subagent thinking 将显式 Max
- 2026-09-22 01:50 [自查发现] ①无 picode-1-8-base tag（待打）②merge-ticket.sh:50 ls-files 无 picode-1-8（待补，单独提交 main）③worktree 仅根目录、main HEAD=3c67958、根工作区干净（仅 untracked scratch 文件）④.scratch/compare/ 无 z18-*/pi18-* 四帧（122 必需、128 建议——按红线以票内文本规格实施并标注）⑤work-notes/ 不存在（待建）
- 2026-09-22 01:50 [计划] 开工自查动作序列：打 tag → 补 merge-gate（一处+单提交）→ 根区 npm install（ELECTRON_MIRROR）→ 建 work-notes/ → 最小 spawn 自查
- 2026-09-22 01:52 [自查①] 基线 tag picode-1-8-base 已打在 main（sha 3a7e5009a5f8490e17bebdcfdb2110ed0dbf184c）
- 2026-09-22 01:54 [自查②] merge-gate 补丁已提交 main（sha 50ba1b4，merge-ticket.sh:50 ls-files 头部插入 picode-1-8 条目，仅一处）
- 2026-09-22 01:58 [自查⓪] spawn 可用性自查通过：scout ping 任务返回 PING-OK spawn mechanics verified（run 86763195）
- 2026-09-22 01:58 [自查③] 根区 npm install（ELECTRON_MIRROR）完成：up to date，623 packages；捆绑 @earendil-works/pi-coding-agent@0.86.1 + 嵌套 pi-ai@0.86.1 ✓（票 134 打包产物核验留待该票）
- 2026-09-22 01:58 [自查④] z18-* 四帧全部缺席（zcode-provider-card / thinking-brain / queue-1 / queue-2）——按红线：122/128 按票内文本规格实施、Comments 标注「样式保真未对照参照帧验证」、总报告列操作者目检项
- 2026-09-22 01:58 [自查⑤] worktree 仅根目录无残留 ✓；main HEAD=50ba1b4（merge-gate 提交后）；work-notes/ 目录已建 ✓
- 2026-09-22 01:58 [自查总结] 开工自查全绿，W1 可开工。W1 派工计划：首批并发 3 = 116（A群头）+120+121；同时预建 123/126/127 worktree 并后台 npm install；117 待 116 合入后派
- 2026-09-22 02:05 [合并协议确认] 从 1.7 历史考证（t93/t95/t96/t100 等）：合并流程 = ①实现者在分支上翻票 Status=ready-for-human+Comments 记 sha ②合并 subagent 先把票文件 byte-identical 同步到 main 单独提交（如 e1a4c91 模式）③跑 merge-ticket.sh（rebase 自动去重翻转提交 + merge --no-ff + typecheck+tests）④根工作区执行，不占并发名额
- 2026-09-22 02:07 [工区] W1 六工区已建（均基于 main@50ba1b4）：wt-116-expand-height/t116-expand-height、wt-120-rail-anchor/t120-rail-anchor、wt-121-providers-configured/t121-providers-configured、wt-123-dead-group-sink/t123-dead-group-sink、wt-126-mcp-border/t126-mcp-border、wt-127-settings-entry/t127-settings-entry；各工区 ELECTRON_MIRROR npm install 后台进行中
- 2026-09-22 02:07 [派工] 首批实现 subagent 已派发（worker/bella-local/GLM-5.3:max/fresh/3h上限）：116 run=e58b2d97、120 run=6395c3e8、121 run=6900a1d5；123/126/127 工区已预建待派。npm install 六工区全部完成

## §3 检查点（每次状态迁移后写：「下一步该做什么」+ 阻塞原因）

- 2026-09-22 02:10 【检查点】W1 首批 3 实现在跑（116/120/121）。下一步：等任一完成后验收（Status/Comments/sha）→ 主 Agent 派独立双轴评审 → 过则派合并 subagent（同步票文件到 main + merge-ticket.sh）→ 补位下一票（优先 A 链 117←需 116 已合；否则 123/126/127）。阻塞：无。
- 2026-09-22 02:26 [看护] 121 worker（6900a1d5）watchdog 报 bash 开 240s——实为 npm run smoke:electron（已先 ps 自查无其他进程），20 分钟级正常，不干预
- 2026-09-22 02:31 [看护] 116 worker（e58b2d97）watchdog 报 bash 开 240s——实为 serialization 轮询等待（wt-121 electron smoke 在跑，其 ps 自查正确检测到，sleep 重试中），不干预。另：116 worker 报 vitest 有 1 个 pre-existing 失败（环境相关 /app/node_modules vs 本地 nvm 路径，自称与 116 无关，1973 个其他测试含其 44 个新增全过）——待主 Agent 独立核验（可能是根区/工区环境差异或 main 既有问题）
- 2026-09-22 02:36 [看护] 120 worker（6395c3e8）同因等待（wt-121 electron smoke 占道，serialization 轮询中），不干预。三个 worker 的 ps 自查/让道行为全部符合协议
- 2026-09-22 02:47 [验收 121] 实现完成报告已收：分支 t121-providers-configured tip=7391a91（实现 d3dd39b），票面 ready-for-human + Comments 记录完整，工作区干净，diff = 4 文件+票文件（168+/27-）。主 Agent 亲验：全套 vitest 1977/1977 全绿（subagent-runner-root 失败不可复现——单独跑与全套均过，判 flaky 环境项，非阻塞）；票 Comments 报备的 ticket-90 smoke 段失败有 base 50ba1b4 A/B 实证 = main 预存在（疑似 pi-subagents fleet RPC→available:false→快照忽略，subagent-bridge.ts:148+session-registry.ts:241）——记入批次遗留，不阻塞 merge（merge 只跑 vitest）；新增 parity 断言（menu_keyboard_model_parity_ok）未经 smoke 实证，已列入双轴评审重点。已派 review-standards(run 1071f821)+review-spec(run 01947d82)，bella-local/GLM-5.3:max，只读
- 2026-09-22 03:0x [评审 121] review-spec 结论 pass-with-notes：7 项验收逐条满足（同集同序/零改动面/三态覆盖/设置节不回归/边界报备/无超范围/测试对齐）；notes = parity 断言待首次全量 smoke 实证（已知已录）。等 review-standards
- 2026-09-22 03:1x [评审 121] review-standards 结论 pass-with-notes：5 项 pass（纯函数/零新缝/App 接线/测试/ADR 纪律）+ 2 soft（①parity 断言两侧非真同源：期望侧 = 缓存 probe 报告，实际侧 = host 推送 models_available（SDK getAvailableSnapshot，非 checkAuth）——假失败风险，建议实证后再保留或降级 log-only；②smoke.ts 两处同形计算重复，可接受）。决策：合并前在 t121 分支实证跑全量 electron smoke（通道被 120 占用中，等空闲）；若 parity 失败→修复轮降级/修正推导
- 2026-09-22 03:1x [看护] 120 worker 第 3 次跑 smoke 中（前 2 次因与 116 冲突正确让道/终止；本轮独占通道，pid 13283）；116 在写自身 smoke 阶段（ticket-91 图贴段等）
- 2026-09-22 03:1x [派工] 并发补位：123 已派（run 8bf22853，worker/bella-local/GLM-5.3:max/wt-123）；当前并发 3 = 116/120/123。121 待 parity 实证后合并
- 2026-09-22 03:2x [验收 120] 实现完成报告已收：分支 t120-rail-anchor tip=5e43a3e（实现 7d233fe），票面 ready-for-human + Comments 记 sha，工作区干净，13 文件（695+/15-：navigator-rail.ts 决策表扩展 + NavigatorRail 接线 + smoke 阶段+祣46 涟漪修复 + visual-rail-anchor harness + CONTEXT.md 词条 + 两帧）。自报：vitest 1977/1978（唯一失败 subagent-runner-root，自称环境性预存——主 Agent 曾在 root/wt-121 亲跑均过，判 flaky，merge verify 遇到时重跑确认即可）；票 120 阶段四格矩阵两轮绿；票 46 涟漪（Composer .trim() 剥尾致短转录恒吸底）已修；visual 帧 ra1/ra2 exit 0。已派 review-standards(bfc73767)+review-spec(e2b7d4c8)
- 2026-09-22 03:2x [看护] 123 worker 其 smoke 因与 116 的 2:56 启动相撞中断（UnhandledPromiseRejection），已 steer 提示「碰撞伪失败优先干净窗口重跑」；116 在跑第 7 次 smoke（迭代其阶段）；120 已完成
- 2026-09-22 03:2x [派工] 并发补位：126 已派（run b212aa01，微票纯 CSS，提示优先静态验收不空转等通道）。当前并发 3 = 116/123/126；121 待通道实证 parity；120 待双轴评审后合并
- 2026-09-22 03:3x [评审 120] review-standards 结论 pass-with-notes：0 硬违反，2 soft（measureAnchored deps 致 scroll 监听 churn——行为正确；探针形状重复——repo 惯例）；祣46 涟漪修复判定最小且正当（仅改 NAV_1 一字符串）。双轴齐 → 120 可合并
- 2026-09-22 03:4x [合并 120] 已派合并 subagent（run b4aafd83，根工作区，同步票文件→merge-ticket.sh 120→flaky 处置指令）
- 2026-09-22 03:4x [看护/关键发现] 116 的 smoke run7 死在 ticket-90 段——与 121 的 base A/B 实证预存在失败同点（疑批次并发致 provider 负载，120 的 run5挂90/run6过90 呈抖动佐证）。已 steer 116：ticket-90 非其回归勿追、自身阶段绿即收尾、主 Agent 将占通道 15-20 分钟
- 2026-09-22 03:4x [验证 121] 通道空闲，主 Agent 已在 wt-121 启动全量 electron smoke（pid 83656，日志 /tmp/t121-parity-verify-smoke.log）——目的：实证 menu_keyboard_model_parity_ok 断言；预期 ticket-90 段仍会死（已知预存在），只看 parity 行。首启后台链早夭（日志未建），已用于 shell 子括号模式重启（pid 92053/92103，运行中）
- 2026-09-22 03:5x [裁决 116] supervisor 请求裁决：ticket-90 跨分支预存在（wt-120/smoke5、wt-121/run2、wt-121/base-smoke3、其 run5/7 同签名；base 无 composer 改动也败）vs 其自身阶段 6/6×3 轮全绿。裁决 = 按完成口径收尾：提交+翻 ready-for-human+Comments 记 ticket-90 预存在证据+披露的两处 smoke 加固（祣81 折叠清理/祣88 图像 settle 等待）单独报备，不追 ticket-90 不再跑 smoke
- 2026-09-22 03:5x [合并 120 ✅] merge 完成：票同步 8c3675a → rebase（票文件冲突取 theirs，树与原 tip 5e43a3e 逐字节一致）→ merge --no-ff = 3b0abc2c51638f8b4cd58d4b76ce38531a43f2c9。验证：typecheck 绿；npm test 首轮 1977/1978 唯一失败 subagent-runner-root——根因已闭合：PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT 从主会话环境泄漏进 subagent shell（测试幂等子句见预置而败），env -u 后隔离 7/7 + 全套 1978/1978 绿。裁决验证 = PASSED。main 已推进 → 后续合并的 rebase 将自动叠加
- 2026-09-22 03:5x [关键根因入库] subagent-runner-root「flaky」= 环境泄漏：主 Agent 会话（pi-subagents 扩展）设 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT，全部 subagent 继承之→其 npm test 必败该项；主 Agent bash 工具环境无此变量故亲跑通过。后续所有合并 subagent 指令改用 `env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT npm test` 口径；实现 subagent 的同项失败报告均属此机制，非代码问题
- 2026-09-22 04:0x [验证 121 ✅] parity 断言实证通过：主 Agent 全量 smoke 中 `menu_keyboard_model_parity_ok bella,bella-local,bella-remote`（menu_keyboard 段全绿）。评审悬念闭合 → 121 派合并（run 3f33c352，含 smoke.ts 双区段保留指令 + env -u 口径）
- 2026-09-22 04:0x [验收 126] 实现完成报告已收：分支 t126-mcp-border tip=9f6d6f4（修复 a9374bb），票面 ready-for-human，工作区干净，1 文件 +4/-1（app.css 单规则 margin 0→0 0 10px + 约束注释）+ s7/s7b 帧。自报：typecheck 绿；vitest 1969/1970（唯一失败 = 已知环境泄漏项，与根因闭环一致）；visual:settings 绿 + 像素级几何证明（DPR2 扫描 10px 干净背景带）。已派 review-standards(06292385)+review-spec(60616cc3)
- 2026-09-22 04:0x 【检查点】已合 1/19（120）；121 合并在跑；126 双轴在跑；116 收尾中（裁决已下）；123 等 electron 通道（主 Agent parity smoke 将在 ticket-90 段自然终结后释放）；127 未派（下一空位）。下一步：121/126 合并完→派 127；116 报告完→验收+双轴+合并；117 待 116 合入后建区派发
- 2026-09-22 04:1x [评审 126] review-spec 结论 pass-with-notes：5 项全满足（10px 节奏属实/两态不破/纯 CSS/帧证据链/无超范围）；附注 = 审查环境无读图能力，采信 harness 断言源码+票面像素测量。等 review-standards
- 2026-09-22 04:2x [评审 126 齐] review-standards 结论 pass：6 项全✅（最小性/注释惯例/节奏属实/帧惯例/两态零触碰/无超范围），无硬违反。126 入合并队列（等 121 合并完，main 写入串行）
- 2026-09-22 04:2x [派工] 127 已派（run 51bf558d，微票；指令含 env -u 口径）。当前并发 3 = 116(收尾)/123(等通道)/127。合并队列：121(在跑)→126→116(待其报告)
- 2026-09-22 04:3x [合并 121 ✅] merge sha 5cf8732（票同步 8ac237a；rebase 干净：7391a91 被 cherry-pick 检测跳过、d3dd39b→3ef8ac7 重放、smoke.ts 双票改动共存；验证双轮绿：脚本内全绿 + env -u 全套 1985 绿；无害噪音 = 清洁环境测试轮 stdout 两行 git 分支切换输出）。已合 2/19
- 2026-09-22 04:3x [合并 126 ✅] merge sha 94653cf（票同步 a84c9d0；rebase 干净；npm test 双轮：泄漏环境唯一败 subagent-runner-root → env -u 全套 1985 绿）。已合 3/19（120/121/126）
- 2026-09-22 04:4x [验证 121 补充] 主 Agent parity smoke 中 ticket-90 也通过（安静窗口佐证其负载相关性）；所需证据已齐后主动杀掉自己的 smoke 给 123 让道
- 2026-09-22 04:4x [看护 123] 123 的 r2 死在 ticket-88 图像竞态（跨分支预存在，116 披露+其 r1/r2 佐证）。关键发现：其 r1 里自身阶段已 8/8 全绿+前置 84/42×54 零回归，仅后续 ticket-75 因 wt-120 2:46 并发抖动败（123 启动前已 ps 自查，并发由对方引入）。已 steer 授权收尾：不再跑 smoke、提交+翻票+报告，ticket-75/88/90 留档不追
- 2026-09-22 04:5x [验收 127] 实现完成报告已收：分支 t127-settings-entry tip=b4d0774（实现 02e1c33），票面 ready-for-human，5 文件（TitleBar 齿轮移除/App 注释/layout-model 注释/smoke 票63 阶段重构/票文件）。自报：typecheck 绿；vitest 1970 全绿（env -u）；electron smoke 设置阶段全绿（⓪/②/⑦b 新断言），同轮 ticket-90 超时（t123 smoke 03:22 并入，资源争用，与 diff 零交集）。已派双轴 review-standards(bc9f669d)+review-spec(8a52fb2f)
- 2026-09-22 04:5x [验收 116] 实现完成报告已收：分支 t116-expand-height tip=21c88a3（实现 1648d87+翻票 d2c1244+ticket-90 指针 21c88a3），票面 ready-for-human，自身阶段 6/6×3 轮绿+composer 族(49/81/91)绿，vitest 1973/1974（环境泄漏项），typecheck 绿，visual:expand 帧绿。发现机械遗留：工作区脏（3 个 visual 帧未处置：e1/e1a 疑似意外重写、e2 为证据帧）——已 resume 原实现者（run e511e16c）处置（提交 e2/还原或正当提交 e1e1a，目标工作区干净）。处置完后派 116 双轴评审
- 2026-09-22 04:5x 【检查点】已合 3/19（120/121/126）。在途：127 双轴评审在跑；116 帧处置 resume 在跑（后接双轴+合并）；123 收尾 steer 已送达（其 sleep 480 结束后消费→提交+报告）；117 等 116 合入。合并队列：127(评审过后)→116(帧处置+评审过后)。通道空闲（无 smoke 在跑）
- 2026-09-22 05:0x [评审 127] review-spec 结论 pass：7 项全满足（齿轮删除无残留/侧栏齿轮保留/⌘, 解绑仍开合/票 74 停靠语义逐字节一致/Esc⌘, 不回归/smoke 重构对齐/无超范围）。等 review-standards
- 2026-09-22 05:1x [评审 127 齐] review-standards 结论 pass-with-notes：1 minor（归档帧 2-settled.png 未随票刷新，与 85/126 先例不一致）+ 2 info（负向探针重复形状/票号标注混用）。处置：已 resume 实现者（run 7ada444f）提交刷新帧（用其已捕获帧，免通道）
- 2026-09-22 05:1x [帧处置 116 ✅] e2-expand-open.png 提交 b194bd5（证据帧）；e1/e1a/e2b 还原（祣49/58 基线帧意外重写，ce90e42 惯例）；工作区 0 条干净。116 分支 tip = b194bd5。已派 116 双轴评审（review-standards 594efb6b + review-spec 62a75354）
- 2026-09-22 05:2x [评审 116 齐] review-standards 结论 pass-with-notes：清单①–⑦全✅（Seam-1 纯函数表驱动/零 setState/头接缝清晰（caret 走 revealComposerCaret=117 落点、draft/value 未动=118 落点）/加固最小且报备/21c88a3 纯 bookkeeping/契约零增量/文案全英文）；4 条判断性意见（展开投影公式第 4/5 份拷贝、NaN 哨兵、祣88 fail 文案、stage 加长）均 repo 惯例可接受；评审环境 vitest 1974/1974 全绿。116 可合并
- 2026-09-22 05:3x [合并 116] 已派合并 subagent（run 2f99bfcb，smoke.ts 多区段 additive 保留指令 + env -u 口径）——116 合入后 117（A 链）解锁
- 2026-09-22 05:3x [看护 123] r3（03:22 启动）再次确认自身阶段 dead_group_sink 8/8 全绿（第二次独立验证）后死于后续预存在段（03:26）；我的收尾 steer（follow_up）在其当前 sleep 工具返回后消费。证据链已足额：r1+r3 自身阶段双绿 + 前置阶段零回归 + 75/88/90 均跨分支预存在留档
- 2026-09-22 05:3x [准备 122] 121 已合→122 解锁。wt-122 已建（基于 720e5d0，npm install 后台中）；等 116 merge 落地后 rebase 到最新 main 再派（避免 Composer.tsx 漂移），z18 帧缺席 override 指令已备好（按票内文本规格实施+Comments 标注）
- 2026-09-22 05:4x [合并 116 ✅] merge sha d0a6be5（票同步 720e5d0；rebase：票文件两笔冲突取 tip 一致侧、两笔空 chore 被 rebase 自然丢弃、smoke.ts 零冲突 additive 双向保全；验证双轮绿：轮1 唯一败 subagent-runner-root(泄漏 env) → env -u 全套 1989 绿）。已合 4/19（116/120/121/126）→ 117 解锁
- 2026-09-22 05:4x [派工] wt-117 已建（基于 d0a6be5）+ npm install 完成；wt-122 已 rebase 到 d0a6be5 + npm 完成。117 已派（run 68d76e2b，local，A 链中票）；122 已派（run 1b995804，bella/GLM-5.3-flash，z18 override 已入指令）。当前并发：117/122 + 123(收尾 steer 待消费)/127(帧修复在跑)——123/127 为收尾态不计满额，实际实现并发 2/3，留 1 槽给 124
- 2026-09-22 05:5x [看护 123] r3 已过 ticket-88（263 行>241，图像竞态本次通过）——123 证据链再加强（自身阶段 r1+r3 双绿）。其实现仍未提交（全部改动在工作区），等 steer 消费后统一提交+翻票+报告。127 帧修复仍在跑（未提交）
- 2026-09-22 06:0x [帧修复 127 ✅] f0b11b1：2-settled.png 刷新入仓 + 票 Comments 注明；实现者无读图能力，改用双证据像素校验（PIL+numpy 几何比对：新帧右簇 3 钮/旧帧 4 钮恰差一钮距 + 构建产物无 Open/Close settings 字符串）——诚实且充分。工作区干净，tip=f0b11b1。已派 127 合并（run 6e70629a）
- 2026-09-22 06:1x [合并 127 ✅] merge sha 6a20aa4（票同步 5debc09；rebase 票文件两笔冲突取 tip 一致侧、空 chore 自然丢弃、smoke.ts/App.tsx 零冲突 additive；验证双轮绿）。已合 5/19（116/120/121/126/127）
- 2026-09-22 06:1x [看护 123] 其 worker 卡在长轮询 bash（sleep 420 循环），收尾 steer 无法消费——已 interrupt 中止该工具调用；child 在消费 follow-up 前完成（实现仍未提交）。已 resume（run 78c455a6）下达收尾指令：提交全部实现+翻票+报告，证据链摘要已内嵌（r1+r3 自身阶段双绿/75=wt-120 并发抖动/88 跨分支预存在且 r3 已过/环境泄漏项）。旧 follow-up 失败通知无影响
- 2026-09-22 06:2x [验收 123] 实现完成报告已收：分支 t123-dead-group-sink tip=40e7d45（实现 d11fe2f），9 文件 +644/−50（group.ts 活性桶+isDeadCwdGroup/reorder.ts 快照排除/Sidebar 死 grip 禁用+锚点钳制/smoke dead_group_sink stage/visual-cwd 沉底断言/CONTEXT 两词条/19 用例）。r1 挂 75（wt-120 并发）、r2 挂 88、r3 过 75/88 后挂 93——均零交集留档。验收项无 visual 帧要求（帧可后补）。已派双轴 review-standards(66358235)+review-spec(19a299e5)
- 2026-09-22 06:2x [派工] 129 已派（run f0ecc71b，W2 thinking 展开记忆，wt-129 基于 6a20aa4）。当前并发 3 = 117/122/129；123 双轴评审在跑（只读不占名额）；123 合并待评审过后
- 2026-09-22 06:3x [评审 123 齐] review-standards pass-with-notes（清单①–⑦全过：纯模型分层/unknown 分支正当最小/快照语义属实/harness 惯例/CONTEXT rider/零契约增量/无新文案；基线意见=Sidebar 死 grip 防御性重复可简化，低）；review-spec pass-with-notes（8/8 满足：表驱动三排序活死混合/恒沉底/Manual 不生效+不进数组/灰行不回归/票 84 不回归含留档修复/smoke 八步对齐/CONTEXT rider/无超范围；两条 Notes=visual 断言增补正当+票 84 顺带修复建议知悉）。已派 123 合并（run 93c227ba）
- 2026-09-22 06:4x [合并 123 ✅] merge sha 391bad7（票同步 1a2f2df；rebase 后 tip c8527e6；smoke.ts +214 纯增量、group/reorder 零冲突、票文件取 tip 侧、sha 记录笔被 drop；验证双轮绿 2008 用例）。已合 6/19（116/120/121/123/126/127）
- 2026-09-22 06:4x [异常留档 123 合并] ①visual:cwd harness cwd4 断言间歇败（读到 cwd2 陈旧旧菜单；合并后 2/6 vs 前基线 0/5；t123 自身断言 6/6 绿、通过轮产品行为正确、失败段属 t54 时代未触碰代码）→ 判定 harness 输入/探针竞态被 t123 恢复期重排 churn 放大，非确定性产品回归；加入批次 flake 清单（75/88/90/93 家族），加固建议（先关旧菜单再探）留操作者后续。②合并 subagent 跑 visual:cwd 时与 wt-117 的 Electron app 重叠（串行化违规，自报；userData/store 隔离结果未受影响；帧存 .scratch/visual-t123-merge/ 未跟踪目录，跟踪基线帧已还原）——教训：后续任何 Electron 活动前 ps 自查必须包含他人 dev-app
- 2026-09-22 07:0x [通道治理] 117 插桩 app（03:58 起，remote-debugging-port 9231）占道：129 smoke r1 死于 ticket-75（wt-117 app 于其中段启动=跨树碰撞，构建期盲点致 117 的 ps 自查通过）；129 已自停 r2 排队；122 实现完成（vitest 1989/typecheck/eslint 绿）在等待循环中做双轴自审。全部处置正确，无干预。若 117 占道 >1h 再 steer 其收束插桩
- 2026-09-22 07:0x [进度] 122 实现面完成：smoke 六腿 stage（锚点相等/首末 provider bbox 全等/ArrowDown 选中+焦点/窄窗重钳/收回原窗）+ visual:menu-geometry 新 harness（mg1–mg5）+ BrainIcon 自绘；129 实现面完成（expandedThinking Set 受控化穿透 TurnContainer）
- 2026-09-22 07:2x [117 卡点→批准 A] t117 worker 4 次 smoke 全死于自身阶段前（t93/t120/t75/t120），其中 t120 stage 在 d0a6be5 上确定性死：场景①单发 4 事件合成突发→单趟 growth 222px>STICK_THRESHOLD_PX 160→吸底判定读者离开→AT_BOTTOM 必败（两次同 DOM+干净通道复现；merge 脚本只跑 typecheck+单测故未被发现）——批次级阻塞。已批准方案 A：test-only 修 t120 场景①逐事件+settle（断言语义不变），票 Comments 披露，修后需 t120+t117 双绿
- 2026-09-22 07:4x [117 进展] ①t120 harness 修复按方案 A 落地：smoke5/6 两跑 t120 段全绿（批次级解阻塞生效）②t117 阶段在 smoke5/6 到达：prefill 腿两跑绿；en/bottom step3 两跑同败→根因=div 镜像与真实 textarea 在边界宽度 taW=793 换行差一整行（阶段误报，真实光标在视野内）→修复：app 侧 measureCaretLineTopPx + smoke 三处镜像全改 textarea 克隆镜像（同元素同宽同样式逐字一致，min-height:0 解 74px 地板钳位）+ drive117/prefill 改 settle-poll（负载下 commit/滚动可晚于固定 140ms）；CDP 验证 10 形状×多宽度克隆镜像行数与真实全一致；单元 1996 绿+typecheck 绿 ③新卡点：全 smoke 死于更早 t44 段（真实剪贴板需窗口获焦，macOS 拒 steal，6 次×100 tick 失败+osascript/CDP 无效，hasFocus=false——锁屏/操作员活跃类环境条件）。已裁决：A 有界重试（每 ~10min，上限 1h，每次 ps 自查防撞 122/129），超时回落 C（分层留档提交：已绿证据/缺口=t117 suite 内绿跑/环境事实）；等待间隙预写翻票与自审，镜像修复属票面核心范围需 Acceptance 对照落点
- 2026-09-22 08:0x [验收 129] 实现完成报告已收：t129-thinking-memory，12 文件 +652/−14（chat-reducer expandedThinking+toggle 动作/registry 同型路由/ThinkingRow 受控化/四层布线/票 99 第三消费者视图本地集合/smoke thinking_memory 六检查点/测试 +11）。自身阶段六检查点绿（临时前移位取证已复原终位）+ visual:thinking 绿 + vitest 2001 绿 + typecheck 绿。键粒度偏离已声明（positional part key 替 entryId——ticket-51 backfill 在 message_end 重写 entry id，字面键会丢展开态）。其 t120 死点 stash A/B 观察与 117 修复收敛（修复合入后自然解除）。已派双轴 review-standards(cde7f2dc)+review-spec(3ff45db3)
- 2026-09-22 08:0x [派工] 124 已派（run bb9ff6fa，W3 并票：零用量过滤+Open task 删除，wt-124 基于 391bad7）。当前实现并发 3 = 117(重试焦点中)/122(等通道)/124；129 双轴评审在跑（只读不占名额）
- 2026-09-22 08:1x [评审 129 standards] pass-with-notes：①–⑧全过（纯 reducer/语义分界双注记/registry 同型路由/第三消费者偏离正当有注/键粒度声明充分无更优方案/smoke 沿惯例+前移披露/零契约增量 additive/无 CJK 无 TODO）；三 note：toggleThinking 两处重复沿先例/positional 键跨分支树导航边界情形建议补注/种子文件不清理沿先例——均不阻塞
- 2026-09-22 08:2x [评审 129 spec] pass-with-notes：①–⑨全过（四行往返表/history_loaded 保留+replay 测试/会话期内存级无落盘/容器语义零改动/第三消费者等价/键粒度偏离裁决接受（ticket-51 backfill 实证，字面键会在操作者场景丢态）/smoke 六检查点/12 文件精确对映/visual 帧+性能红线结构等价）；无缺失无超范围无实现错误；复跑 203/203 绿。已派 129 合并（run e9de1413）
- 2026-09-22 08:3x [合并 129 ✅] merge sha a64cac1（票同步 6b327dc；rebase 零冲突——b7476f5 被自动跳过，feat 提交干净重放；smoke.ts/chat-reducer.ts 不同区段 ort 自动合并；双轮验证绿 2020 用例）。已合 7/19（116/120/121/123/126/127/129）
- 2026-09-22 08:3x [通道调度] 通道空闲中：117 在焦点重试间隙 sleep 480s（其 typecheck+unit 51/51 已过）；122 在 visual.ts 注册收尾，已 steer 提示其抢当前窗口跑 smoke；124 在实现中（模型键规范化：大写本地拼写早于网关回显，展示=GLM-5.3-flash）
- 2026-09-22 08:5x [批次级环境事实+处置] t44 焦点问题确认为批次级：122 r1/r2 均死于 t44（window never took focus）；117 第 9 次尝试仍拒；持续 1.5h+——操作员在用机，macOS 拒绝后台 app 抢焦点，全 suite 绿跑在操作员活跃期间不可得。处置：推广 t129 已验证的「临时前移位取证」技术——已 steer 117（升级其 C 回落为 C+：前移位绿跑+终位复原+披露，拿绿即提交不再等焦点）与 122（六腿阶段前移位取证后翻票提交）；124 排队中同样适用。终位全套绿跑留 merge 会话/安静窗口（t120 修复合入后可过）
- 2026-09-22 08:5x [进度] 124 实现面完成：R9 语义裁决落盘（圆环全期口径+曲线范围口径，共用 excludeZeroTokenModels，先滤后切 top-6）/R15 删除完成/fixture 两常量模型/typecheck+unit 2015 绿+fixture 契约 104 绿/usage 聚合 smoke PASS/构建绿，正排队等通道取证
- 2026-09-22 09:0x [验收 124] 实现完成报告已收：t124-usage-zero-filter（实现 2eba6e3，tip 0e85349）。vitest 2015 绿/typecheck/eslint 绿/node 版 usage smoke PASS（real store 270 会话）/visual 九帧全绿（donut 6→5、双范围 series、drilldown 开合）；electron smoke 两次死 t44（环境，留档）。self-review 期间修一处脆弱断言（'0 tokens' 子串误伤 '120 tokens'→精确匹配）。已派双轴 review-standards(6a9aad04)+review-spec(095fc422)
- 2026-09-22 09:0x [派工] 125 已派（run b946bdd5，W2 HeatmapView weekly 本周 7 天+零格/tooltip/裁剪三修，wt-125 基于 a64cac1，指令含前移位取证与 visual 无需焦点的提示）。当前实现并发 3 = 117(前移位取证中)/122(同)/125；124 双轴评审在跑
- 2026-09-22 09:1x [验收 122] 实现完成报告已收：t122-menu-geometry（实现 34c6a20，tip 6ee9e2d）。R4 列高解耦（model 列 absolute 内滚、容器高只由 provider 列定 200–320）/R5 align='chip' 三重再转向+钳制/BrainIcon 12 段自绘。vitest 1989 绿/typecheck/eslint 绿/visual 五帧断言绿/smoke 六腿绿（前移位取证已复原逐字节核验）。披露：键盘腿跳过（焦点不可得；t69 绿+零交集代证）、t28/t90 偶发留档、z18 样式保真未对照参照帧。已派双轴 review-standards(2c6cd9e9)+review-spec(44da0fff)（均 flash）
- 2026-09-22 09:1x [派工] 130 已派（run 9f62d44f，W3 fork 自动命名 Fork of …，wt-130 基于 a64cac1）。当前实现并发 3 = 117(取证中)/125/130；122/124 双轴评审在跑
- 2026-09-22 09:2x [评审 122 spec] pass-with-notes：三件全落地（R4 解耦 CSS 证据 7015-7045/R5 三重再转向+钳制+幂等/BrainIcon 纯几何零资产）；两条遗留均票内已披露（z18 样式保真→操作者目检、键盘腿间接证据链成立）；小弱点：smoke 腿②仅 providerCount>=1 未显式保证首末 provider model 数不同（同目录时测试力减弱）；121 兼容确认。等 122 standards
- 2026-09-22 09:3x [评审 124 齐+澄清] spec pass-with-notes（①–⑧满足；④圆环语义裁决「满足票面意图不打回，建议操作者 ack」；⑨ visual 缺口——主 Agent 核实推翻：四帧实在根工作区 .scratch/picode-1-8/work-notes/t124-visual-*.png，mtime 05:50:49 与进度日志吻合，评审者只查了 worktree 内 .scratch/visual）。standards pass-with-notes：**major 必修**=smoke 腿⑧断言恒 false（行渲染 formatTokenCount 裸数字，'tokens' 只在 footer，环境恢复后必假报）+3 minor（注释编号序/测量窗分界注释/fixture 重复）。已派 124 修复轮（resume ae4ffdfc：修腿⑧断言（探 .dd-tokens span）+minor 随笔，vitest/typecheck/eslint 复绿，提交+票 Comments 记录）
- 2026-09-22 09:3x [评审 122 standards] pass-with-notes：清单①–⑧全✓（delta 收敛单点/CSS 注释完整/BrainIcon 注释/harness 惯例+独占守卫/smoke 惯例+披露落位/零契约/键盘腿披露充分/无 TODO）；四条判断性 note（probe 双份约百行可抽共享/190px 硬编码耦合/CJK 注释沿全仓惯例/冗余 instanceof）。双轴齐 → 已派 122 合并（run 6d2cac91；app.css 多票区段保留双方指令已入）
- 2026-09-22 09:4x [验收 117] 实现完成报告已收：t117-ime-scroll（实现 07d2722，翻票 9ce35c8，4 文件）。Seam-1 composerCaretLineTop 纯函数+克隆镜像 reveal 重写+prefill rAF reveal+t117 stage（CDP 真实输入矩阵）+t120 逐事件修复。验证：vitest 1996 绿/typecheck 绿/探针 pre-post 对照（worstUp=0.0/invisible=0/prefill scrollTop=255）/**前移位取证 suite 内绿跑（prefill_viewport_ok+matrix_ok+done 全绿，该轮连 t44/crash-isolation/t20 都过）**。残留：终位全套绿跑留 merge 会话/安静窗口。已派双轴 review-standards(1322e81b)+review-spec(50e61e83)
- 2026-09-22 09:4x [修复轮 124 ✅+抽查] 9075a5d→tip caedff8：腿⑧断言重写为真实行网格（.dd-session 非空+.dd-tokens 数值形 /^(\d+\.?\d*)[KMB]?$/、计数=rows−1、表头 Session/Tokens、dd-open 零存在），双源核实（DrillDownPanel.tsx:74/77 标记+visual 帧）；minor 三项全处（注释顺化/测量窗分界注释/registerSpelling 抽取字节不变）。vitest 2015 绿/typecheck/eslint 绿。主 Agent 抽查 diff 通过。124 合并排入（等 122 合并完，串行）
- 2026-09-22 09:5x [派工] 133 已派（run f420fc9b，W2 微票：用户泡文本段 user-select:text 与助手侧对称，wt-133 基于 5d17eb4）。当前实现并发 3 = 125/130/133；117 双轴评审在跑；合并队列：122(在跑 6d2cac91)→124→117
- 2026-09-22 10:0x [评审 117 spec] pass-with-notes：①–⑨全满足（矩阵 SCENARIOS×LANGS 真实合成/克隆镜像替换硬计数留档根因/prefill rAF+共用路径/en_hard 零回退/零 setState+expand additive/t120 修复留痕+双绿证据/前移位披露+终位核验（t117 在 t116 后 t81 前）/4 文件对映+跨票披露/118 接缝零触碰（122 区段外+调用点 316/340/579 未动））；notes：实现形态属票内裁量/断言容忍与探针一致/51 用例复跑绿
- 2026-09-22 10:1x [评审 117 standards] pass-with-notes：清单①–⑧全✓（Seam-1 分层/零 setState/克隆镜像 DOM 卫生对齐 measureCollapsedHeight 先例/t120 修复 test-only 边界（STICK_THRESHOLD_PX 核实 scroll-stay.ts:43）/smoke 惯例（CDP attach-finally detach/settle-poll 依据成文/fail 携 DOM 数值/74px 地板收尾）/前移位披露诚实/零契约/无 TODO（CJK 仅 IME 题材测试数据））；发现均 LOW/INFO（stage 内克隆镜像三份可抽共享串/settle-poll 两份/既有 CJK 行非本 diff）。117 双轴齐，merge 排队（122→124→117）
- 2026-09-22 10:2x [合并 122 ✅] merge sha 44a1053（票同步 5d17eb4；rebase 仅票文件 Status 冲突取 tip 侧、bookkeeping 自动丢弃、smoke.ts +254 纯增量/app.css cascade 两 hunk 自动零冲突；验证双轮绿 2020 用例，clean-env 首跑一次未捕获偶发后复跑两次全绿——归入批次抖动谱系留档）。已合 8/19（116/120/121/122/123/126/127/129）。已派 124 合并（run 879b8191，串行队列 124→117）
- 2026-09-22 10:4x [合并 124 ✅] merge sha 1a10678（票同步 e151e05；rebase 票文件两笔取 tip 侧、tip 笔自动 drop；smoke.ts usage 段 vs t122 段/app.css 自动零冲突；验证双轮绿 2027 用例）。已合 9/19。已派 117 合并（run 469b3b4d，t120 pacing 修复保全指令已加强：4 处 emitContractEvent 间 150ms settle 必须完整保全）
- 2026-09-22 10:5x [合并 117 ✅] merge sha 87d745c（票同步 12ffee1；rebase 零冲突、实现干净落位；t120 修复保全核验：L6643-6649 四处逐事件+150ms settle 完整、burst→per-event 根因注释完整、断言语义不变；双轮验证绿 2034 用例）。已合 10/19（116/117/120/121/122/123/124/126/127/129）→ **118/119 解锁**（A 链 118 优先，119 随后；槽位等 125/130/133 之一完成）
- 2026-09-22 10:5x [进度] 125：visual 九帧取证完成（u1–u9，签名 cards/heatCells/series/donutSlices）接近收尾；130：fork 改名事件流已实证（session_created Fork of … + session_renamed Fork of …），探针 TIMEOUT 在诊断；133：实现中（点击纪律 reclaimComposerFocus）
- 2026-09-22 11:0x [验收 125] 实现完成报告已收：t125-token-activity（实现 865dd59，tip a04b62d）。charts.ts weekly 重写（锚定末格周一、七单日列、零填/level-0）+HeatmapView tooltip 同族白卡+焦点圈裁剪修复+smoke 六检查点（前移位取证+复原单一插入块 git diff 核验）+visual u2/u2b 绿。vitest 2029 绿/typecheck 绿。披露：weekly 下钻改该日（格即日）、Seam-2 契约不动。已派双轴 review-standards(ffc3e1ba)+review-spec(b81faad0)
- 2026-09-22 11:0x [派工] 118 已派（run fbc86019，A 群尾票：技能选中保留既有文本只剥离触发 token，wt-118 基于 87d745c，含 117 接缝保护指令）。当前实现并发 3 = 118/130/133；125 双轴评审在跑；合并队列空（等 125 评审过）
- 2026-09-22 11:1x [评审 125 spec] pass-with-notes：①–⑨全满足（锚点表 5 例×7 序列+全零周+跨月让位+跨年+daily 缺日锁定/七单日列+未来日 heat-0/tooltip 同族 CSS 与 trend-tooltip 对照/padding 4px 首格左缘≥3px/载荷逐字节不变（旧三元→恒 null，daily/cumulative 两值恒等）/Q4=B 格即日下钻裁量已披露/单一插入块 213 行核实/heatmap.weekly 未动+views 锁定仍在/9 文件一一对应）；无缺失无超范围无实现错误；notes=评审环境泄漏项/fixture 今日假设已披露
- 2026-09-22 11:2x [评审 125 standards] pass-with-notes：清单①–⑧全✓（纯函数 heatmapGrid/白卡族配方复用/CSS 最小/语义披露/smoke 终位+单一插入块/u2b 真实输入偏离有注/零契约准确/无 CJK）；发现：**[中] HeatmapView:41 新增 eslint error set-state-in-effect（effect 内 setHover(null)）**+[低] tooltip 十条重复沿家族先例+[低] 测试空行。已派 125 修复轮（resume 9bcfa56f：渲染期失效 key 方案修 [中]+空行随笔+家族重复留档不修）
- 2026-09-22 11:3x [修复轮 125 ✅] 9f7725c→tip c631544：删 effect 内 setHover(null) 改渲染期失效（hover 携 mode+cells 引用，键不匹配即无卡，零 effect 零级联）+daily 用例前移。eslint 触及五文件零告警/vitest 2029 绿/typecheck 绿。已派 125 合并（run 858a3999）
- 2026-09-22 11:5x [合并 125 ✅] merge sha dbdb52a（票同步 5120e7c；预检 dirty 处置：visual-t125 十帧临时移至根 .scratch/合并后移回零删除；rebase 票文件两 hunk 取 tip 侧、空笔 drop、smoke.ts 语义验证 t125 段紧跟 usage_hover 段后且 t117/t122/t124 段俱在；双轮验证绿 2043）。已合 11/19（116/117/120/121/122/123/124/125/126/127/129）→ 119 已解锁（117 已合）待空位；剩余：118(wip)/119(queued)/128/130(wip)/131/132/133(wip)/134(最后)
- 2026-09-22 12:0x [验收 130] 实现完成报告已收：t130-fork-auto-name（实现 76e0e3b，tip e6db7fb，7 文件 +437/−31）。parse.ts 抽 sidebarTitleProjection（索引扫描器与 fork 命名单一路径）+forkAutoName（TITLE_MAX_CHARS=80）；handleFork 取源名→fork→setSessionName（写 fork 文件、源零改动）；**随票窄修：subagent-bridge 单例 pi.events 在 fork 会话替换后 stale→fleet RPC 撞替换窗口 uncaughtException→host 退出（smoke 2/4 复现栈取证）；requestRpc stale bus 降级 null+timer 清理**；smoke 两腿绿（前移位×2 独立取证+复原逐字节）；vitest 2029 绿/typecheck 绿；Round B 过、Round K 环境性失败 stash 对照留档。已派双轴 review-standards(b0aea964)+review-spec(5b16134b)
- 2026-09-22 12:0x [派工] 119 已派（run 64999630，W4 插桩定位票：空闲输入不移动转录 agentRunning 门+底部目标查证，wt-119 基于 dbdb52a，宽 pattern 通道纪律+插桩收敛时长指令已入）。当前实现并发 3 = 118/119/133；130 双轴评审在跑；合并队列空
- 2026-09-22 12:1x [评审 130 spec] pass-with-notes：①–⑧全满足（六腿表驱动+同源断言+截断含前缀/fork 写自身文件源字节级不变/两腿六类断言（设置面=topbar 口径微偏非缺失）/session_renamed 零新增（contract.ts 未触）/New Task 投影如实披露/stale-bus 窄修正当（always-answers 契约保持+vitest 验证）/Round B 过 Round K stash 对照留档/7 文件一一对应）；1511+34 复跑全绿
- 2026-09-22 12:2x [评审 130 standards] pass-with-notes：清单①–⑧全✓（投影去重 67 例佐证/纯函数截断数学正确/handleFork 三步最小与 handleRename 同形/窄修单点 try-catch 契约一致/smoke 段惯例+thinking_level_change 防脏快照/零契约/测试覆盖/无 CJK）；发现均 LOW/INFO（firstUserTitle 补回 type 守卫更严/stale-bus events.on 腿未测/两遍扫描备忘）。双轴齐→已派 130 合并（run b985837f，含 t125 式未跟踪帧处置预案）
- 2026-09-22 12:3x [合并 130 ✅] merge sha 367c723（票同步 9ca9952；rebase 票文件取 tip 侧、smoke.ts t130 段 L15647–15847 位于 t129 段后且 t117/t125 段完好、parse.ts 自动；双轮验证绿 2052）。已合 12/19（116/117/120/121/122/123/124/125/126/127/129/130）。剩余：118(wip)/119(wip)/128(queued,flash)/131/132/133(wip)/134(最后)
- 2026-09-22 12:4x [验收 118] 实现完成报告已收：t118-skill-keep-text（实现 9cc1dd9，tip d485018）。commands.ts 新 Seam-1 纯函数 stripTriggerToken（token=/+查询止于 caret+紧随分隔空白，余文去前导空白保留；粘接场景边界裁决=token 止于 caret 否则吞首词/CJK 近全吞，留档理由）；Composer card 分支改走缝（117 接缝零扰动）；vitest 2037 绿/typecheck 绿/smoke 五步绿（前移位 188插0删）/visual sc4 四帧绿。已派双轴 review-standards(2fd945a0)+review-spec(8410b67b)
- 2026-09-22 12:4x [派工] 128 已派（run 96705e6b，bella/GLM-5.3-flash，W4 大票：queue ZCode 重构+reorder_queue_entry additive op+host-contract 报备硬要求，wt-128 基于 367c723，z18 override 已入指令）。当前实现并发 3 = 119/128/133；118 双轴评审在跑；合并队列空
- 2026-09-22 12:5x [评审 118 spec] pass-with-notes：①–⑧全满足（表驱动 20/20（粘接/CJK/中途 caret/域外 clamp/重组闭环）；边界裁决偏差判定满足意图（锚 menu-surface query=slice(1,caret) 契约，票面字面会吞首词即 bug 本身）；图存在维度以独立 state+smoke 端到端覆盖；smoke 五步断言齐全；零回归核实（commands.ts 25/0 纯增）；CONTEXT 词条；117 接缝零扰动；8 文件对映+sc4 增补披露；numstat 188/0 复核吻合）
- 2026-09-22 13:0x [评审 118 standards] pass-with-notes：清单①–⑧全✓（Seam-1 分层与 applyMention 先例同构/三路径边界清晰零重叠/117 零扰动 hunk 级核实/表驱动覆盖 dispatch 真实路径建模/smoke 惯例+gate auto-deny 与 t72 一致/CONTEXT 文体一致/零契约/无 CJK）；发现均 LOW/INFO（探针双份沿惯例/域外 caret 注释略过强/空 args trim 未入表）。双轴齐→已派 118 合并（run 783fd588，含未跟踪帧处置预案）
- 2026-09-22 13:1x [合并 118 ✅] merge sha 961f560（票同步 7b6353a；rebase 票文件两笔取 tip 侧、代码文件全自动；双轮验证绿 2055）。已合 13/19（116/117/118/120/121/122/123/124/125/126/127/129/130）——A 群（116/117/118）全数落地。剩余：119(wip)/128(wip)/131/132/133(wip)/134(最后)
- 2026-09-22 13:2x [进度] 119：agentRunning 门已落 scroll-stay 纯模型（pinnedBottomAfterViewportShrink 入参），vitest 全套 2052 绿/typecheck/build 绿，正排队验证探针；133：剪贴板探针（未聚焦 renderer 写剪贴板能力）跑完在继续；128 实现中
- 2026-09-22 13:4x [验收 128] 实现完成报告已收：t128-queue-rebuild（实现 602b35e，翻票 tip 55c87df，14 文件）。拖动柄/角标/Edit/垃圾桶行构成+段内拖动重排（半行几何放置指示 R11）+Clear 退役+行高 28px 等高（P20）+host reorder_queue_entry additive op（runQueueDanceCore 扩展：clearQueue→对账→重排→按序重投喂，图片镜像保序，竞态口径照票 100）+host-contract 报备+CONTEXT 词条。vitest 2071 绿/typecheck 双绿/eslint 干净/host-contract queue round 全绿/electron 队列段全绿（Clear 不存在/P20 等高/拖换序/delivery echo [S2,S1,Q4,Q2]/图保序）/visual 两帧。z18 样式保真披露+操作者目检项已列。已派双轴 review-standards(07932e52)+review-spec(2bfd292f)（均 flash）
- 2026-09-22 13:4x [派工] 131 已派（run 9e7cf0ae，W5 复现定位票：History 0 rows fork 会话第一场景+四插桩点，wt-131 基于 961f560）。当前实现并发 3 = 119/131/133；128 双轴评审在跑；合并队列空
- 2026-09-22 13:5x [评审 128 齐] spec pass-with-notes：七条验收全满足（host-contract 报备+malformed×3+旧载荷共存+形状冻结/表驱动双表+组合例/electron 队列段六类断言/visual 两帧/Edit prefill 零 diff/CONTEXT 词条/立即钮无实现+clear_queue op 保留仅渲染层退役）；无缺失无超范围无实现错误；notes=z18 目检+t44 未跑段。standards pass-with-notes：**2 条 low 级 CJK-in-string 硬违反**（smoke.ts:14620 fail 模板「保序」/queue-mirror.test.ts:192 测试名「越上越先注入」）+判断性意见（halfRowAbove 可抽/{kind,index} 凝型/泛型 void 分支）。已派 128 修复轮（resume feb74dec：两处英文替换+复绿+随笔，其余留档）
- 2026-09-22 14:0x [修复轮 128 ✅] dea5dbc→tip f5f41e7：两处 CJK-in-string 英文化；vitest 2071 绿/typecheck 双绿/eslint 触及文件干净；判断性意见留档。已派 128 合并（run 3a889afc，含未跟踪帧处置预案+contract additive 指令）
- 2026-09-22 14:1x [合并 128 ✅] merge sha 93a1646（票同步 b8ab012；rebase 票文件一笔取 theirs、其余全自动——contract 仅增 reorder_queue_entry；双轮验证绿 2074）。已合 14/19（116/117/118/120/121/122/123/124/125/126/127/128/129/130）。剩余：119(wip)/131(wip)/132(queued)/133(wip)/134(最后，需 116–133 全合）
- 2026-09-22 14:2x [看护 133 超时] 其 worker 被 2h 上限击杀于锁屏等待循环（lsappinfo front=loginwindow，macOS 锁屏期拒一切 focus steal）。实现已提交 672411c（CSS 单点+smoke 五腿 stage 终位）；行为腿全绿×2（前移位取证已复原逐字节）；vitest 2020/typecheck/eslint 绿；visual:transcript 零回归；唯 Copy 剪贴板腿锁屏物理不可跑（裸 electron 探针 6 次实证 writeText 永不 settle）。已 resume（run ab52e4c0）按其自述回落收口：翻票+证据链+Copy 环境受阻披露（含 serialization 险情自报与 pattern 教训）
- 2026-09-22 14:3x [验收 133] 收尾完成：tip 2a5ca70（实现 672411c+翻票），票 Comments 全量记录（行为腿×2 证据/Copy 腿锁屏探针实证披露/pattern 教训/腿序重排+hand-back 加固披露）。已派双轴 review-standards(79ffa71c)+review-spec(edb127d4)
- 2026-09-22 14:3x [派工] 132 已派（run b417b230，W5 回归定位票：⌘J 新会话焦点不进终端——四入口参数化 smoke 防线，wt-132 基于 93a1646）。当前实现并发 3 = 119/131/132；133 双轴评审在跑；合并队列空。批次数：19 票中已合 14，剩 119/131/132/133/134 五票
- 2026-09-22 14:4x [评审 133 standards] pass-with-notes：清单①–⑥全✓（CSS 单点/拖拽沿 t81 形+种子 t97 族+hand-back+腿序重排有代码内理由/锁屏披露链/前移取证披露/零契约/无 TODO）；发现 LOW=腿①④断言序列可抽 assertPartialSelection133（沿 stage 自含惯例不强制）+INFO=注释一词「取证」（豁免内）
- 2026-09-22 14:5x [评审 133 spec] pass-with-notes：8 项中 7 满足（拖拽 58/177 核算一致/非文本段零选区/FollowView 59/177/视觉零变化采信/交互不破/3 文件清单无超范围/前移取证披露），**必改 1 项：腿⑤ Copy 断言常数错位**（COPY_TEXT_133 应为 DRAG_TEXT_133——Edit 已移走 u2，腿⑤点击 u1，payload=177 字全文；解锁后实跑必失败）。已派 133 修复轮（resume cbf21107：一行修+腿⑥常量正确性确认指令）
- 2026-09-22 14:6x [修复轮 133 ✅] 988c05e→tip 1a79e45：腿⑤断言 DRAG_TEXT_133（保留 177 全文 vs 58 选区语义）；typecheck/eslint/vitest 2020 复绿。已派 133 合并（run 98fd4c9f，smoke.ts rebase additive 预案）
- 2026-09-22 15:0x [验收 131] 实现完成报告已收：t131-history-zero（实现 c57e878，翻票 tip 2a2b9d7，11 文件 +411/−23）。**根因确诊：session_tree 嵌套深链（841 节点/depth 1690）超 Electron IPC 序列化深度限制（阈值 300–400 条目）被静默丢弃**→registry tree 恒 null→History 诚实 0 rows；两症状同根（长会话深链 + fork 深文件）；发送/终止只是查看时机。修复=wire 扁平化（shared/sessions/tree-wire.ts 纯模块 toWire/fromWire；host 扁平发；registry fold 唯一消费点；空态文案不动）。插桩链四点闭环（host 发 841 ✓→supervisor 转发 ✓→renderer 从未收到→registry null；对照实验广度型 631 行 vs 链式丢弃）。vitest 2062 绿/typecheck/eslint 绿；history_deep 段绿（430 链 430 行+fork@e200 201 行，前移位取证后复原，披露）；smoke:host Round A/K stash 基线 A/B 复现同死→零交集留档。截图 t131-history-deep-session-842rows.png。已派双轴 review-standards(716f30f9)+review-spec(55cf00ca)
- 2026-09-22 15:1x [评审 131 spec] pass-with-notes：8/8 满足（复现闭环/实测夹逼阈值 300 条~610 层 OK vs 400 条~810 层丢失/修复最小化+两症状同根成立/history_deep 断言齐全+取证注记/vitest 106 复核绿/smoke:host flake stash 基线可采信/清单对应/空态文案未动）。注记：a)**session_tree 载荷形状 breaking（非 additive）但仓内消费者全数同步+无并行工单消费该事件**——终报披露项；b)终位段取证缺失系 t44 环境阻塞非票缺陷（评审自动纠正我提示里的 R14→R1）
- 2026-09-22 15:2x [评审 131 standards] pass-with-notes：无硬违反。note=形状变更非 additive（AGENTS.md 字面约束为 additions；在飞票均不消费 session_tree+单体同版本发布→不判硬违反，票内留档核实正确）；info=假想旧 renderer effectiveChildren 崩（无混合版本场景备档）；note=tree-wire:37 断言式 cast 可收敛（极轻）。Fowler 12 条零命中；清单③–⑧全✓（host 最小缝/fold 唯一消费点全仓 grep 证实/表驱动含 0.86 fixture census/段惯例含 fork@e200 注释依据/全英文无 TODO/插桩零残留）；实跑 vitest 2062+typecheck+eslint 绿。**131 双轴齐=双 pass-notes 无必改→待 133 合并完成后串行派合并**
- 2026-09-22 15:3x [合并 133 ✅] merge sha d4a436a（票同步 8273924；smoke.ts 两处冲突逐 hunk 双保——docstring t117+t118∥t133、stage 段 t130∥t133（终位 thinking_memory→t130→t133→Quit）；翻票/轮记录提交判空丢弃属 rebase 正常；双轮验证绿 2074）。已合 15/19（+133）。剩余：119(wip)/131(待合，已派 run 404e64d0)/132(wip)/134(最后，需 116–133 全合）
- 2026-09-22 15:4x [合并 131 ✅] merge sha 8cc4fae（票同步 a663bae；仅票文件冲突取 tip 侧；smoke.ts/contract.ts/host-contract-smoke.mjs/host/index.ts 全自动——history_deep 段与 t133/t128 段共存已验证；双轮验证绿 2081）。已合 16/19（+131）。剩余：119(wip)/132(wip)/134(最后)。合并道空闲
- 2026-09-22 15:5x [看护 119/132] 均健康：119（310k tok）在终验 smoke——自诊 t28 段失败=turn 长度竞态（run-dot 探针时后台 turn 已 agent_end，与 diff 零交集）重跑验证中；132（56k tok）复现成功——自建 t132-repro.ts 三场景对照：S1（boot 空态+create 在途+⌘J→焦点落 BODY）失败、S2b（跨项目 create→workspace 重挂载→焦点丢）失败、S2/S3 对照过——根因形状=workspace 重挂载杀终端焦点；正在扩展 harness（不同 cwd 变体+focus 监听自检）
- 2026-09-22 16:0x [验收 119] 实现完成报告已收：t119-idle-input（翻票 tip c82544e）。**根因（插桩取证闭环）：idle 打字期间零 JS 滚动写入**——composer 卡增长缩减 transcript cell clientHeight（655→569），未触碰的 scrollTop 让视口底边骑升，尾行 Copy/Fork 滑入 composer 下；二阶=引擎后续布局原生还原 pre-pin 绝对 scrollTop（含 caret mirror 延迟无几何 revert）。尾行假说否证（底部钉都写 scrollHeight−clientHeight 含尾行，缺的是补偿）。修复=纯模型 nextIdleBottomPin（per-burst 序列闩+cumulative-shrink 界 distance≤shrink+1；own-scroll-up 断界逐字节不动；回底 re-arm；agentRunning 门零回退 93/94/75）+ChatView 两臂（ResizeObserver 重置于 agentRunning 翻转+USER_SCROLL_QUIET_MS 门 scroll 臂）。vitest 2052 绿（22 新模型测试）；smoke idle_typing_119 4/4 连续全绿；crash 隔离修 pidForSession 后绿；探针已删。t28 段预存竞态零交集留档（baseline stash 同死更早于 t44）。截图 c119-p2-multi-line.png（对照 c119-p0-baseline.png）。已派双轴 review-standards(9279e864)+review-spec(807ed4dd)
- 2026-09-22 16:1x [评审 119 standards] pass-with-notes：无硬违反；6 low 均判断性——①smoke.ts:1051 fixture CJK 串（无「刻意覆盖 CJK 几何」说明）②scroll-stay.test.ts:278 测试名 CJK（同 t128 已修先例）③ChatView 两臂重复 10 行块可抽 runIdlePin ④两臂调用点 agentRunning 门控与模型返回 previous 语义略不对称⑤IDLE_BOTTOM_SEQUENCE_IDLE 命名歧义（未武装 vs 非 agent 运行）→ _DISARMED 更诚实⑥魔法数 +1 容差未注释。清单①–⑦全✓（模型家族风格/监听清理惯例/四场景+DOM dump/pidForSession 修复与文件惯例一致+披露/与 t117 无文件交集且 caret-mirror 还原恰由 scroll 臂补偿/全英文无 TODO）。待 spec 轴后一并派修复轮
- 2026-09-22 16:2x [评审 119 spec] pass-with-notes（评审纠正我提示 R2→R18）：①插桩主因链闭环但 P5/P6/P8 二阶行为仅存票面文字（work-notes 无录、/tmp 转储 0 字节）②smoke 4/4 依票面记录未复跑③尾行计入满足（小瑕疵：票称「全部底部钉写 sh−ch」实为写 sh 靠 clamp，目标等价）④运行态零回退✓⑤机制一致✓⑥文件清单✓但「22 新测试」误记（实 9 it/19 断言）⑦t28 处置可信⑧探针零残留✓。**(a) 流程缺口：票翻转未提交上分支（仅工作树）——主 Agent 已核实**（分支 tip c82544e 票仍 ready-for-agent）。(c) 两边缘：agent_end 翻转后无 at-flip 重臂；armed burst 内自滚≤收缩界后续收缩 re-pin 拉回底（与票 75 张力）。spec.md:139 机制句滞后（票面已改写）。已派 119 修复轮（resume 3e41e086：翻票提交+CJK 测试名+票记录修正+fixture CJK 披露+边缘项分析→决策请求或已知边界留档）
- 2026-09-22 16:3x [修复轮 119 ✅] tip 2e2fbbd：翻票随分支提交（补流程缺口）/测试名英文/票记录 9 it·19 断言/fixture CJK 加英文披露注释（有意覆盖非 ASCII 几何）/+1 容差注释；边缘①判定非缺陷（RO observe() 初始播报重臂，探针遥测实证，票 Comments 已记）；**边缘②判定真实缺陷→决策请求**：armed burst 内 ≤C+1 带自滚上移被拉回违反票 75；最小修=wheel deltaY<0 同步关闩（遗留滚动条拖拽无方向信号）。vitest 2052/typecheck/eslint 绿。**主 Agent 裁决：批准**（方向信号无歧义、票 75 不变量优先、滚动条残留记已知边界）——已 resume 0d8ac065 实施边缘②修（既有 close 转移+两模型测试+票 Comments 边界记录）
- 2026-09-22 16:4x [看护 132] 健康：四入口 stage 已写（boot 空态/新会话/桥接切回+票 105 语义回归腿）；全套 smoke boot-empty 腿已过（terminal_focus_132_boot_empty open+focus ok）但死于 t44 焦点窃取拒绝（机器忙，环境类）；已按 t129 先例前移位取证（重建 8.79s，取证跑中——当前 4 分钟 bash=取证跑等待，合法）。无干预
- 2026-09-22 16:5x [边缘②修 119 ✅] tip 47801e7：wheel deltaY<0 立即关序列闩（模型走既有 closeIdleBottomSequence 转移零新分支；+2 模型测试，describe 11 it/23 断言）；票 Comments 裁决说明+已知边界（滚动条拖拽无方向信号不关闩，超界后 bound-break 兜底）；vitest 2054 绿/typecheck/eslint 绿。已派 119 合并（run e0789d8a，tip 47801e7；smoke.ts 逐 hunk 双保+ChatView t117 语义双保预案）
- 2026-09-22 17:0x [合并 119 ✅] merge sha 9d3b474（票同步 d095282；rebase 后 6a372fd→967e985→4610fb7；smoke.ts doc 一处 hunk 双保，idle_typing_119 与 t131/t133 四 stage 齐全已验证；scroll-stay/ChatView/tests 字节一致；视觉帧 7 张按 t125 先例暂存后移回；双轮验证绿 2092）。已合 17/19。**剩：132（取证中）→ 134（最后，需 116–133 全合）**
- 2026-09-22 17:2x [验收 132] 实现完成报告已收：t132-terminal-focus（实现 6ad6a11，翻票 tip 43aade9）。**复现（插桩证据链）**：S1（boot 空态+create 在途 ⌘J）seq-diff 0->1 refNull=true→双 rAF 打进 null ref 被静默消费→shell 后到无 bump→焦点停 BODY；S2b（聚焦会话+异 cwd create 在途 ⌘J）serve 打进旧 shell→公告重挂载换掉接收者→焦点落 BODY；票 106/98 干扰源被时间线排除。**根因=票 105 双 rAF 把请求绑定 fire 时刻 workspace 实例**。修复=Seam-1 terminalFocusServeDecision（armed×receiver→serve/hold；heldByReplaced×activeIsEditable→恢复/收手，9 例表驱动）+TerminalDock armed-until-served 状态机（hold 跨挂载存活；卸载上报持焦、替换者恢复；不可见即取消；持焦捕获在 useLayoutEffect cleanup）。smoke 四入口参数化全绿（boot 空态腿在 empty_state+terminal_focus_132 三腿）。vitest 2083 绿/typecheck/eslint 绿。t44 四轮堵死环境段，132 阶段前移取证后复原（披露）；105 阶段未能重跑（零代码改动+132 腿覆盖全部 bump 路径+dock-model 44 例单测替代证据）。已派双轴 review-standards(cf88a64f)+review-spec(bcbbd186)
- 2026-09-22 17:3x [评审 132 standards] pass-with-notes：清单①–⑦全✓（决策表 9 例与 Seam-1 家族一致/focusSeq 保留为 bump 触发器+双 rAF 改道决策表共存非死代码/layout cleanup 论证符合 React 语义/ensureShellFocused 单一真相+boot 腿放 empty_state 有注释论证/105 语义断言仍在+阶段零改动/无插桩残留/无 CJK（注释内除外）无 TODO）。发现均判断性：minor=smoke 助手 DOCK_STATE/pressJ 等三处同形可提模块级 helper（105 自包含先例放行）；nit=132 bridge 腿 300ms settle sleep 缺注释；info=过期 rAF 回调 stand-down 自愈备忘+armed 交叉冗余组合可接受
- 2026-09-22 17:4x [评审 132 spec] pass-with-notes（评审纠正我提示 R21→R6）：8/8 满足——复现链成链（插桩 harness 已移除仅 narrative 留档，票面明示）/定位定论与修复设计一致/四入口四腿齐（boot 空态 smoke.ts:737-852 + 132 阶段 3021-3120 三腿，单一真值 ensureShellFocused）/自检复盘（105 五腿均假设 shell 已挂载；防复发=请求从「时刻」改「状态」）/桥接不抢焦双向断言/typecheck+eslint 实跑清+vitest 2082/2083 唯败=已知环境泄漏零交集/6 文件清单一一对应+44 例归属清晰+契约 additive/前移位披露+105 阶段零改动独立核实。**(c) 轻微边角**：registerFocus(null, held) 不触发 serve 决策——末会话关闭时 held 可存活至下次无关挂载；常规路径由 activeIsEditable+visible 取消兜底，非验收违例留档。**132 双轴齐无必改→已派合并（run 968c6594）**。合并后 116–133 全合→触发 134（最后票）
- 2026-09-22 17:5x [合并 132 ✅] merge sha be105d9（票同步 0f939b1；仅票文件冲突取 HEAD=分支 tip 终态，翻票提交判空丢弃正常；smoke/TerminalDock/BottomDock/dock-model/tests 五文件自动纯 additive；双轮验证绿 2101）。**已合 18/19——116–133 全数落地，仅剩 134**
- 2026-09-22 17:6x [派工 134 ✅] 已派（run 182903d8，最后实现票，wt-134 基于 be105d9 带全批修复验证）：双因子双修复——①PATH 合成（登录 shell 快照+静态探测点，Seam-1 纯函数表驱动，注入所有需 PATH 子 spawn，LSEnvironment 否决，异步不阻塞就绪）②捆绑 SDK 0.86.1 对齐核验（根 node_modules 已核 0.86.1；打包产物核验+启动自检如实提示）。净化环境等效（env -i）插桩双因子分别实证；electron smoke sanitized-env 启动+应用内 spawn 腿；Finder/Dock 实启留操作者（验收记录模板三要素）。翻票入分支纪律已注入（t128 先例）
- 2026-09-22 18:0x [看护 134] 其 smoke 死于 Round K（票 101 stop 契约超时）——131 已留档的同族 flaky；worker 在追+末条命令超时（bash 卡 20 分钟）。已 steer：中断挂起命令勿烧超时；Round K 做 stash 基线 A/B（基线同死→零交集留档收口）不超 30 分钟，主体双因子取证优先。其 diff 已 8 文件（package.mjs/run-all.sh/host-supervisor/index/smoke.ts 等 +266 行）
- 2026-09-22 18:1x [看护 134 续] worker 响应 steer：stash 基线 A/B 完成（纯 main 基线 Round K 同死→零交集确认）；另自诊 Round K 机制=shell 泄漏 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT 被主程序当操作员覆盖致 pi-subagents RPC 失效（env -u 后带 diff 也绿）——后在终报更正为与泄漏无关（env -u 仍死，A/K 属 t131 先例环境 flaky 族，票中如实更正）；全套 suite 重试中。期间操作者问是否有 subagent fail——逐一核实：134 在跑健康；其余 failed 全为历史（旧批次/本批开场 spawn 空壳/133 超时已 resume 合并/123 paused 痕迹/一个失效索引项），19 票账本全有着落，无需任何重启
- 2026-09-22 18:2x [验收 134] 实现完成报告已收：t134-spawn-path（实现 856b9550+翻票 973cc4e，8 改+8 新）。**双因子修复**：①PATH 合成——shared/spawn-path.ts 纯函数（current→login→probe 保序去重不劣化 current，nvm 当前版本解析）+main/spawn-path.ts 启动早期异步一次（printenv PATH 非 echo——fish 空格列表；5s 超时降级）+hostForkEnv() 注入全部三处 host fork；LSEnvironment 否决②SDK 对齐——subagent-sdk-alignment.ts+启动自检（<0.86.1×≥0.70→host_notice toast 不静默）+package.mjs 打包断言产物 SDK=pin 且 pi-ai≥0.86.1+测试断言 dev node_modules 版本与能力探针。**双实证**：修前 env -i spawn node ENOENT+0.85.1 tarball 无 transcript 导出；修后同条件 PATH 18 条 vs 裸 4 条+真实 runner pid+RPC stop 收敛。vitest 2153/typecheck/pty/usage/interop 绿；electron smoke 正常 PATH 段绿。Round A/K+117 零交集 stash 基线留档。票 Comments 含手工验收三要素模板+新实例边界。已派双轴 review-standards(4115c571)+review-spec(f354c0e9)
- 2026-09-22 18:3x [评审 134 standards] pass-with-notes：清单①–⑨全✓（shared/main 分层 Seam-1 惯例/三处 host fork 全覆盖 grep 实证且 node-pty-factory 属 --login 交互壳非漏网/notice 纯函数复用 host_notice 零 IPC 改动/package.mjs 打包期硬失败/入 run-all.sh 第 7 步/零 CJK 零 TODO/无插桩残留）。发现均判断性：3 处版本比较重复（shared×2 可合一）/JSON 解析同型 3 份/t134 段 3 个轮询循环可收敛 pollUntil/降级窗口边界（合成前 5s fork 拿裸 PATH，已留档裁决 never blocks window）/探测路径不一致 minor/smoke.ts 单 harness 惯例不计违反
- 2026-09-22 18:4x [评审 134 spec] pass-with-notes：8/8 实质满足——①双因子实证（prefix-run.log ENOENT+postfix-run.log runner pid；SDK 因子评审独立读 review.js:4 属实）②Seam-1 表驱动 52/52 实跑绿③sanitized-spawn-smoke 腿+smoke.ts t134 腿+正常 PATH 腿 117 前全绿（117 与 stash 基线同错）④package.mjs 断言+bundled-sdk-versions 双探针+启动自检 host_notice 复用⑤模板+新实例边界明记⑥本席复跑 2153/2153 绿+pty/usage/interop PASS⑦16 文件一一对应⑧零交集 stash 基线+误判更正诚实（泄漏变量仅致 vitest 假失败，评审独立复现）。三小注：0.85.1 证据为叙述+结构旁证/票面「11 源」实为 12/**验收框 6 未勾+ps 自查未明示**。已派 134 票面修复轮（resume b6ac7a45：勾框 6+ps 自查声明+计数修正，纯票面文本不改码）
- 2026-09-22 18:5x [修复轮 134 ✅] tip 2da49a6：框 6 全勾/ps 自查声明行/计数 12/补 0.85.1 探针工件指针（/tmp/pi0851-probe/ 双 tarball 解包树实证）。已派 134 合并（run e73f0587，**本批最后一笔**）
- 2026-09-22 19:0x [合并 134 ✅] merge sha 331922e（票同步 db58fcd；仅票文件冲突×2 取 ours=tip 字节一致；smoke.ts t134 段与 t119 段共存抽查；双轮验证绿 2153）。**🎉 19/19 全数合并——批次实现阶段收官**。main HEAD=331922e。进入终验+终报阶段

## §4 批次终报（PiCode 1.8.0 · 19 票 · 2026-09-22）

**总况**：19/19 全数合并入 main，HEAD=`331922e`，零 parked；全部经独立双轴评审（review-standards + review-spec，均 pass / pass-with-notes）；7 票有修复轮（119×2、124、125、127、128、133、134）；全部合并走 `scripts/merge-ticket.sh`（rebase + --no-ff + 双轮 npm test 验证，第一轮已知 env 泄漏败 + `env -u` 全绿）。未 push、未打 tag、未 release。终验（HEAD 331922e）：vitest 123 文件/2153 用例绿；typecheck 双绿；smoke:host 死于已知 A/K flaky 族（两次死点不同，t131/t134 stash 基线同死留档一致）；smoke:electron 终位 3 跑无确定性阻塞（死点 t105 leg2/t117/t122 R4 均已知焦点敏感/flaky 族；t44 剪贴板腿三跑全绿=批次首次终位通过；t1xx 终位绿 9 票：116/119/120/121/122/123/126/131/132）。证据：`.scratch/picode-1-8/final-regression/00-summary.md`（01–04 分步日志）+ /tmp/final-regression-*.log。

### ① 每票一行（票 / 分支 tip / 合并 sha / 评审 / 轮次 / 备注）

| 票 | 分支 tip | 合并 sha | 评审 | 修复轮 | 备注 |
|----|---------|---------|------|--------|------|
| 116 | b194bd5 | d0a6be5 | 双轴 pass-notes | 0 | rebase 票文件冲突取一致侧 |
| 117 | 9ce35c8 | 87d745c | 双轴 pass-notes | 0 | t120 pacing 修复保全核验（smoke.ts L6643-6649） |
| 118 | d485018 | 961f560 | 双轴 pass-notes | 0 | stripTriggerToken Seam-1 |
| 120 | 5e43a3e | 3b0abc2 | standards pass-notes/spec pass | 0 | ticket-90 段预存在失败（跨分支 A/B 留档） |
| 121 | 7391a91 | 5cf8732 | 双轴 pass-notes+parity 实证 | 0 | rebase 干净 |
| 122 | 6ee9e2d | 44a1053 | 双轴 pass-notes（flash） | 0 | z18 披露（见②）；合并时一次抖动复跑全绿 |
| 123 | 40e7d45 | 391bad7 | 双轴 pass-notes | 0 | 两条 harness 异常留档 |
| 124 | caedff8+9075a5d | 1a10678 | 双轴+修复轮 | 1 | smoke 腿⑧断言重写（.dd-session/.dd-tokens） |
| 125 | c631544+9f7725c | dbdb52a | 双轴+修复轮 | 1 | set-state-in-error→渲染期 hover 失效（mode+cells keyed）；dirty 预检 mv 处置 |
| 126 | 9f6d6f4 | 94653cf | spec pass-notes/standards pass | 0 | rebase 干净 |
| 127 | f0b11b1 | 6a20aa4 | 双轴+帧修复轮 | 1 | PIL+numpy 双证据像素验证 |
| 128 | f5f41e7(impl 602b35e+dea5dbc) | 93a1646 | 双轴+修复轮（flash） | 1 | 两处 CJK-in-string 英文化；reorder_queue_entry additive 契约入 host-contract 报备 |
| 129 | b7476f5 | a64cac1 | 双轴 pass-notes | 0 | 键粒度偏离（位置 part key vs entryId）裁决接受，ticket-51 回填 |
| 130 | e6db7fb | 367c723 | 双轴 pass-notes | 0 | 邻接 stale-bus 崩溃修复（requestRpc fork 会话交换后降级 null） |
| 119 | 47801e7(impl c82544e+2e2fbbd+边缘②) | 9d3b474 | 双轴+两轮修复 | 2 | 翻票入分支缺口补；CJK 测试名；边缘②裁决（wheel deltaY<0 关闩，票 75 优先）；t28 预存竞态留档 |
| 131 | 2a2b9d7(impl c57e878) | 8cc4fae | 双轴 pass-notes | 0 | 根因=嵌套深链超 IPC 序列化深度静默丢弃；wire 扁平化；载荷形状 breaking 已留档（仓内消费者全同步） |
| 132 | 43aade9(impl 6ad6a11) | be105d9 | 双轴 pass-notes | 0 | 根因=105 双 rAF 绑 fire 时刻实例；Seam-1 决策表+armed-until-served 状态机；四入口 smoke 防线 |
| 133 | 1a79e45(impl 672411c+988c05e) | d4a436a | 双轴+修复轮 | 1 | 腿⑤断言常数错位修复（DRAG_TEXT_133）；Copy 腿锁屏物理不可跑披露 |
| 134 | 2da49a6(impl 856b9550) | 331922e | 双轴+修复轮（票面文本） | 1 | 双因子双修复+双实证（见③）；Round A/K+117 段 stash 基线零交集留档 |

### ② 122/128 样式保真与 z18 参照帧

z18-\* 参照帧（z18-zcode-queue-1/2.png 等）操作者始终未落盘——122/128 均按票内文本规格实施，票 Comments 声明「样式保真未对照参照帧验证」。**操作者目检项**：
- 122（菜单几何 mg1–mg5）：证据帧已随合并入 main `.scratch/visual/`（t122 系列）；目检构图=溢出菜单与触发器对齐、翻转/上推边界。
- 128（队列 ZCode 构图）：单条 `/Users/liaokechen/PiCode/.scratch/visual/5a-queue-single.png`、两条 `/Users/liaokechen/PiCode/.scratch/visual/5-approval-queue.png`；目检=行高 28px、grip/角标/垃圾桶等高（P20）、半行放置指示（R11）。

### ③ 票 134 双因子与操作者手工验收

**双根因子（均已插桩实证+修复）**：
1. PATH 因子：Finder/Dock（GUI）启动不继承 shell PATH → host fork 解析 `node` 失败（`spawn node ENOENT` 实证留档 /tmp/t134-prefix-run.log）。修复=PATH 合成（登录 shell 快照 printenv PATH + 静态探测 nvm//usr/local//opt/homebrew/~/.pi；Seam-1 纯函数表驱动；hostForkEnv() 注入全部三处 host fork；5s 超时降级；不阻塞窗口）。修后同条件 PATH 18 条 vs 裸 4 条+真实 runner pid+RPC stop 收敛（/tmp/t134-postfix-run.log）。
2. SDK 因子：app 曾捆绑 pi-ai 0.85.1 缺 transcript 工具导出（pi-subagents 0.70.1 review.js:4 需要；0.86.1 才有；/tmp/pi0851-probe/ 解包实证）。修复=0.86.1 pin 核验（dev node_modules+package.mjs 打包期断言+bundled-sdk-versions 测试）+启动自检（SDK<0.86.1×pi-subagents≥0.70 → host_notice toast，不静默）。

**操作者手工验收步骤（修复以新启动实例为限，运行中实例不热更）**：
1. 从 Finder/Dock 启动 PiCode（新实例）；2. 任一会话内 spawn 一个 subagent（如 `/run scout --bg` 或会话内派发）；3. 记录三要素：启动方式（Finder/Dock）/ spawn 结果（成功与否+runner pid 若可见）/ 版本事实（关于页或 toast；SDK=0.86.1、pi-subagents=0.70.1）。模板在票 134 Comments。

### ④ 挂起票

无——19/19 全合并。Deferred 项（非挂起，证据口径已闭环）：smoke:electron 终位全套绿（3 跑死于已知焦点敏感/flaky 段无确定性阻塞；per-ticket 前移位等价取证+t1xx 终位绿 9 票+t44 三跑全绿；建议安静窗口复跑一次全套收尾）；smoke:host Round A/K flaky 族（stash 基线同死留档，t131/t134 两票独立复现）。

### ⑤ 环境状态与遗留风险

- **main**：HEAD 331922e，19 个 merge 提交；未 push/未 tag/未 release（等待操作者）。基线 tag `picode-1-8-base`=3a7e500；merge-gate 补丁 50ba1b4。
- **worktrees**：19 个全保留（wt-116…wt-134，含各自 node_modules，约 23G）；零删除。
- **遗留风险**（均为环境级，票内留档）：①t44 焦点门（操作员活跃/锁屏时 macOS 拒绝 focus steal——批次证据规范=前移位取证）②已知 flaky 族：ticket-75/88/90/93/28、host-contract Round A/K、t117 CDP IME 段、t122 R4 hover 抖动、visual:cwd cwd4 偶发 stale-menu 竞态 ③子代理 shell 需 `env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 跑 vitest（泄漏变量致 subagent-runner-root 假失败）④t131 session_tree 载荷形状变更（嵌套→扁平 wire）偏离 additive 字面口径——仓内消费者全数同步+无并行消费，评审留档接受 ⑤134 PATH 合成前最长 5s 窗口内 fork 拿裸 PATH（never blocks window 裁决留档）。

——批次终。2026-09-22。停下等操作者。

## §5 追加轮（操作者 dev-app 试跑反馈 · 2026-09-22 11:4x）

| 票 | 内容 | 状态 | run |
|----|------|------|-----|
| 135 | 队列卡上移（纯区位，Q6 维持——操作者裁决不加立即钮） | fix-round(resume 482d4734，standards **fail**→阻断修复) | 082d92b5 |
| 136 | subagent 专属侧栏（新入口+固定 tab+互斥） | merged | 65b02489 → tip c9445fc(重放) | **c3619d2**(sync 2edd2ce) |
| 137 | 大脑图标对齐 ZCode（Lucide Brain 精确字形） | merged | 76065550 → tip 81076fb | **6289419**(sync 3386bf4) |

137 实现完成：Lucide Brain 9-path 零手调；NCC 0.96/0.98 参照↔模板+0.9999 两表面互证双证据；vitest 2153 绿/typecheck 清/visual 两套 exit 0。**主 Agent 复核 th1 帧：用户泡完整渲染（worker 报「用户泡未渲染」疑为双实例冲突跑误读/瞬态）——已交评审员独立复核**。遗留：工作树留脏（11:58 全套 visual 帧重生成未提交，处置交合并预检）。参照帧存 `.scratch/picode-1-8/reference/`。
- 2026-09-22 13:5x [验收 136] 实现完成报告已收：t136-subagent-sidebar（impl 543b57d+docs cddf691=tip；新 SubagentPanel.tsx+subagent-panel-model.ts，改 TitleBar/SidePanel/App/icons/app.css/layout-model/preferences/main/index.ts/smoke.ts/visual×2/tests×4/帧×12）。mutex_136 九腿全绿（双向宽继承 560/640/手动折叠不联动/宽度记忆）；subagent_dir/chat/stop 非环境腿全绿；SidePanel 四 tab 零回归；smoke:layout 绿；vitest 2175 绿/typecheck 0 错/build 绿。留档：①fleet 腿环境阻断（pi-subagents RPC 不应答——ticket-111 probe 同失败，与 Round A/K flaky 族同谱系；UI 链路 visual harness 注入验证）②ticket-28/105 段零交集留档③13:27 两次与 wt-135 并发违规自报（后未复发）。已派双轴 review-standards(401614be)+review-spec(6fc8ad24)
- 2026-09-22 14:0x [评审 136 standards] pass-with-notes：无硬违反。判断性：resize 拖拽三件套与 SidePanel 逐字重复 ~55 行（建议后续抽 usePaneResize）；layout-model toggle-subagent-panel 死词汇（测试驱动）；App dispatch persisting bound 形状重复。正面：store 零 diff/契约零触/shared 纯增量/subagent-panel-model 是 reducer 薄守卫层非复制/tab 交互复用 panelReducer/badge 语义完整（含 aria 单复数+>9 截断）/smoke 重定向把 ×-close 从索引改为按 tab 自身解析（修正固定 tab 后索引必错隐患）/mutex 九腿结构规范
- 2026-09-22 14:1x [评审 136 spec] pass-with-notes：七条验收全满足——入口恒在+badge 语义迁移/固定 tab 数据源含 Ended 段（25 行分页断言）/唯一派发点迁入/kinds 移除+四 tab 选择器 scope 逐 hunk 核实/mutex 九腿逐条对账（reducer 同 commit 折叠+纯函数 planRightPaneWidthSwap+等宽 guard 防循环）/重定向完整（fleet 腿环境阻断留档可接受——probe 同死证据链）/30 文件一一对应（main/index.ts 仅 fakePreferences 配套）。(c) 语义注记：重开恒回固定目录 tab（票面未规定恢复语义，合理读法）；badge 侧栏开启时隐藏（t101 先例）。vitest 评审机 2174/2175（环境泄漏，main 同败，零交集）。**136 双轴齐无必改→已派合并（run bc2a1626，含 worktree 脏帧 mv 暂存预案）**
- 2026-09-22 14:2x [合并 136 ✅] merge sha c3619d2（票同步 2edd2ce；分支重放后 tip c9445fc；唯一冲突=票文件 add/add 取分支侧；docs 提交判空丢弃正常；worktree 实际全净——预期脏帧不存在，无需暂存；双轮验证绿 2175/124 文件）。追加轮：136 已合；剩 135（验证中）/137（spec 评审中，齐后修复轮 NCC 注释+帧刷新 chore）
- 2026-09-22 14:3x [评审 137 spec] **pass**（3 非阻塞备注）：八项全✓——全量替换铁证（新旧帧 diff 恰两处 brain 换新；侧栏疑似点经 RGB+逐像素核实为会话标题文字非图标）；单一定义；自建光栅化器独立复算 NCC 同结论（ZCode=Lucide 几何，手调回退不触发）；mg4 前缀=新首 path；零回归（diff 仅 BrainIcon hunk）；**th1 用户泡真实已渲染**（泡底色过浅 L≈236-242 致低阈值扫描漏检，spec 评审逐字母读出全文确认——实现者误读，主 Agent 结论正确）；vitest 2153 独立重跑绿。备注非阻塞：mg 系新旧帧分辨率不同/th1 多 context ring 为捕获瞬态/NCC 差值为光栅化器 AA。已派 137 修复轮（resume 98ade03b：NCC 注释统一+帧刷新 chore 分支提交）
- 2026-09-22 14:4x [修复轮 137 ✅] tip cbed358：icons.tsx NCC 注释统一终版实测（e949500）；34 帧随 chore(137) 免重跑提交（33 brain 帧逐一模板匹配 0.9365-0.9367=tip 代码一致确认）；typecheck/vitest 2153 复绿。**插曲：worker 随笔误判「th1 用户泡未渲染（pre-existing）」——主 Agent PIL 实测裁决不成立**（泡底色 (239,239,236) vs 背景 (249,249,247) 仅差 10 灰阶致阈值扫描漏检；泡全文+Copy 行清晰在帧内；spec 评审正确）；已 resume（aff39c4a）更正票面记录防误导
- 2026-09-22 14:5x [更正 137 ✅] tip 81076fb（worker 复测采纳裁决：泡在 y110-156/x955-1309 完整渲染；初判系把泡内文本误读为顶栏会话标题+泡底圆角误读为背景带）；票 Comments 已按裁决改写，纯票面文本。已派 137 合并（run e347e42c）
- 2026-09-22 15:0x [合并 137 ✅] merge sha 6289419（票同步 3386bf4；3 处票文件冲突取分支侧；impl+34 帧 chore 全自动；根区 untracked z19 参照帧经 blob 哈希证实与分支已提交版一致后删除写回同字节零损失；双轮验证绿 2175/124 文件）。**追加轮：136/137 已合，仅剩 135（验证中）**
- 2026-09-22 15:1x [验收 135] 实现完成报告已收：t135-queue-above（8 文件：ChatView 挂 chat-dock/Composer 去 queue prop 留三 op/QueuePanel+EmptyState 微调/app.css 独立卡 --bg-inset+radius16+同列 860 居中零间隙/smoke queue stage 新区位断言+几何不变探针+119 stage ③ idle 队列腿+三 harness rider/visual.ts/票面/两帧）。vitest 2153 绿/typecheck 清/host R17 轮绿/queue stage 隔离驱动 EXIT 0（票 100→128→135 全腿含 delivery_order+图保序+Clear 缺席+P20+composer 几何不变）/idle 腿 5 连绿/PIL+numpy 对照 z19（列对齐 0px/交界零间隙）存 evidence/t135-pixel-compare.{py,txt}。留档：全套既有 flake 家族（117/105/K）零交集；三 rider 零产品面待评审确认。已派双轴 review-standards(1cfae57e)+review-spec(cbf3c796)
- 2026-09-22 15:2x [评审 135 spec] pass-with-notes：七条全落地（区位双探针实绿/像素复跑一致/行规则零漂移+t100queue 全腿绿/idle 三腿 8 份日志绿/host 轮绿/2152-2153 环境性唯败零交集/帧实测）。rider 逐行确证纯移动+零产品面。两处文档口径注记：①smoke 段①腿旧段头注释仍写 INSIDE（断言本体已改）②票 Comments「圆角 16 vs ~14」vs 原语 8.0 vs 9.5（原语系统性低估半，同量级两读皆成立）。等 standards 轴
- 2026-09-22 15:3x [评审 135 standards] **fail**（1 阻断+1 major；产品面干净）：**阻断=queueRepairStage() 被插到 fail()（never）之后的死代码位（smoke.ts:15484），全套 smoke 永不运行队列段**（评审实证 10 份全套日志 queue_repair_start 计数全 0；与提交信息「原位调用」相悖；原插入点留空）——抽闭包时错位，属「断言已改但覆盖被静默吞掉」回归，正是评审制度要拦的。major=证据文件 t135-pixel-compare.{py,txt} 未随分支提交（根区 untracked）。判断性三条留档（ComposerApi 所有权/列轨第 4 处复制/radius 数值）。正面：行规则零漂移逐字节核实/119 腿设计扎实/rider 有机理注释/无 CJK/契约零触。已派 135 修复轮（resume 482d4734：移回原位+证据落分支+**全套 electron 取证 queue 段到达**+spec 两注记；已知 flaky 族按留档口径）

## §6 Linear 同步（2026-09-22 14:4x–15:0x）

操作者指令：PiCode 全部迭代全部 issue 同步到 Linear（项目此前未建）。执行：①装 Linear MCP（mcp.linear.app，OAuth）②本地盘点 = 10 迭代（picode-mvp + 1.0–1.8）143 张票 ③建项目 PiCode（P-LIA-2，team LiaoKC）+ 10 个迭代标签 iter:* ④派 sync worker 批量迁移（其会话无 MCP 工具→自建 Python 直连 pi-mcp-adapter OAuth 令牌的 JSON-RPC 通道，幂等断点续传 /tmp/picode-linear-sync-state.json）⑤对账 143/143 零错误；主 Agent 独立抽查（LIA-5/76/145/147 标题+标签+identifier 正确）。映射：状态 resolved/done/ready-for-human→Done(137)、ready-for-agent→Todo(4)、135→In Progress(1)、wontfix→Canceled(1)；评论同步 130 条；描述=同步头+票面全文。项目地址 https://linear.app/liaokc/project/picode-74b0696348fe 。OAuth 令牌 ~24h 有效（同步已完结，无后续依赖）。

**§6 修正（15:0x）**：操作者问「为什么 4 个 Todo」→ 复盘 = manifest 解析器只扫票头（`## Comments` 之前）的 `**Status:**` 行，而 73/78/79/96 四张的唯一 Status 行写在 Comments 区内 → 被默认成 ready-for-agent → Todo。全量复核（以每票最后一行 Status 为准 vs manifest）仅此 4 张误判（#123 为尾注假阳性）。四张票面实况 = ready-for-human（已实施完等人审）→ 按映射应为 Done。已改 LIA-84/89/90/122 → Done 并读回验证；本地状态文件同步修正。修正后项目分布：Done 141 / In Progress 1（135）/ Canceled 1 / Todo 0 = 143 ✓。期间 mcp.linear.app 链路抖动约 4 分钟（DNS 正常 TCP 超时，15:06 恢复），修正顺延完成。

**§5 135 修复轮·裁决记录（15:1x）**：worker 12 跑全套（runs 11-22）确定性死于 t105（xterm 焦点被夺，连续 5 跑；132 另 3/12；均为已知 flaky 族），「全套 log 出现 queue_repair_start」被环境卡死，worker 请求裁决。主 Agent 裁决 = (b)+(b')：按批次既定「临时前移位取证」规范跑一次前移位全套取证（queue_repair_start + 队列腿绿 + 105 死亡同 log 留档）→ 字节一致恢复原位 → Comments 全量披露（前移规范引用 / 105·132 flaky 机理 / 117 CJK fixture rider 单独 commit / ③ 腿引擎修复 run13 机理+7/7）；不做重试刷率、不引入 SKIP 机制；105 焦点被夺（疑会话流事件 churn，app 层、135 diff 面外）作为候选票留操作者裁决，本票不追。止损线：前移跑中队列腿失败即停手报告；全套尝试封顶。

**§5 135 合并完成（16:5x）**：修复轮六提交（tip f6ea01c→rebase 后 c2995ea：阻断修复 2cfd636 / ③腿引擎 18e3716 / 117 fixture 451d5a4 / 105 riders c3b3372 / 文档 d5683d6 / 证据 f6ea01c）+ 前移位取证 run 23（queue_repair_start + ①-⑨ 绿，⑩ 票128既有预算 vs 模型延迟超时、选择器跑 EXIT 0；字节一致恢复）。合并：sync 4ebfa3c（票面字节一致落 main）→ rebase 冲突三处（票面 add/add、两张视觉帧 binary）按口径取分支侧 → 未跟踪证据原件（旧版路径解析）让位跟踪版 → merge e738b3f。验证两轮：脚本内置轮 + env -u 轮（typecheck 双清、vitest 2175/2175 全绿，含 135 新增 22 测试）。**追加轮（135/136/137）至此全部并入 main**。Linear LIA-145 → Done。遗留候选票（操作者裁决）：t105 焦点被夺（环境会话流事件 churn 引发 xterm 失焦，app 层）；t117 CJK fixture 本机字形步进问题已在 135 分支内修复落地。

## §7 终验修复轮（操作者终验 npm run dev 反馈 · 2026-09-22 20:3x 启动）

操作者终验报两处交付物未达 ZCode 参照，intake 已立票 138/139（R22/R23 定稿；原编号 135/136 让位给追加轮后改号，见 main f6170aa/aaed3d6）。恢复流程：run-log §0–§6 已重读；main HEAD=aaed3d6 ≥ 5f5f2d5 ✓；worktree list 与账本一致（116–134 + 追加轮 135/136/137 全保留）。

- 20:3x [装载] 票 138-cascade-zcode-rework（R22：两列真分离+选择卡贴触发钮）与 139-heatmap-zcode-rework（R23：三模式日格热力图+分级悬浮卡；Q4=B 口径退役）已读；两票均无阻塞、可并行。参照帧 9/9 在位：pi19-menu-current + z19-menu-1/2 + z19-heatmap-{daily,weekly,cumulative}-1/2（.scratch/picode-1-8/reference/）✓——不挂起，可开工。
- 20:3x [工区] wt-138-cascade-rework / wt-139-heatmap-rework 已建（均基于 main@aaed3d6）+ npm install 完成（各 622 包）。即将派发两实现 subagent（worker / bella/GLM-5.3-flash:max / fresh / 3h 上限 / async）。
- 20:4x [派工] 138 已派（cascade 重修，任务文本=手册 T138 块+票号修正 135→138+条款 A–D+批次环境事实），run d0d2a262；139 已派（heatmap 重修，同型），run eaf26a24。两票并行，并发 2/3。模型 bella/GLM-5.3-flash:max / fresh / 3h 上限 / async。
- 21:0x [看护 138] watchdog 报 bash 240s——实为 electron smoke 在跑（idle_typing_119/user_copy/slash_gate 诸段绿），menu_surface 段现「Shift+Enter with menu open rewrote composer」失败，worker 自加临时诊断重查中。行为正常，不干预。
- 21:1x [看护 139] watchdog 报 bash 240s——实为序列化等待+全套 electron smoke：ps 自查检测到 wt-138 dev app 占道 → 60s 轮询 3 次让道 → 通道清空后启动全套 smoke。协议行为全部正确，不干预。
- 21:5x [验收 138] 实现完成报告已收：t138-cascade-rework（实现 2d4406f，tip 2922529，11 文件：menus.tsx 两列分离+chip 贴钮两轴转向/app.css 连体规则退役+独立卡/smoke menu_geometry 段 138 断言/visual-menu-geometry 重指向+mg1–mg5 帧刷新/票面+progress）。证据：mg1–mg5 exit 0+帧目检对照 z19（分离卡 106vs137/groove 6.0/model top==悬停行/贴钮 2.0/左缘对齐 chip）；menu_geometry 段 3 次独立全绿（68/69/98 同 run 绿）；vitest 2175 绿（env -u）/typecheck 双绿/eslint 改动文件零输出。披露：①run-all 无单次全绿（预存 flaky 族零交集，Round K stash 基线 A/B 留档）②menu_surface 首轮一次性假失败复跑绿 ③model 卡顶对齐悬停行+视口竖向帽为帧取证裁量。已派双轴 review-standards(b3739a31)+review-spec(379f2950)（均 flash，只读）。
- 22:0x [评审 138 spec] **pass**（2 条非阻塞备注）：①帧像素实测过（mg1 两卡 190×106/137、缝 6px、model top==悬停行；mg2 与 z19 构图一致；mg4/mg5 同型）②smoke DOM 断言非恒真（旧实现必败判别式；3 份 run log 留档）③68/69/98 段齐全零改动面④typecheck/vitest 复跑绿（评审机泄漏项 env -u 后 7/7）。无缺失/超范围/实现错误（y 转向符号/x 钳制全跨距/包含块几何均核实）。备注：mg2≡mg3 同态双拍；披露一/二的原始 log 未留存但采信留档。
- 22:1x [评审 138 standards] **pass-with-notes**（0 阻断/0 major/2 minor/2 nit）：①两列分离实现最小分层清晰、旧连体规则删净无死代码②align='chip' 双轴转向+全跨距 x 钳制核实、AccessMenu 不受影响、R4 不变量保留——calc→NaN 注释不属实（CSSOM 返回 used px）属注释事实瑕疵 minor③harness 无 135 票型静默覆盖丢失④帧与票纪纪律⑤零契约增量。Fowler：composerTop 死数据（minor）/探针块重复（惯例覆盖）。vitest 2175 实测绿。**双轴齐绿无必改→已派 138 合并（根工作区，run a642440a）**。
- 22:4x [合并 138 ✅] merge sha **fc439a0**（票同步 38e8c57，blob 与分支 tip 字节一致；rebase 仅票文件 Status 一处冲突取 tip 侧，重放后树与原 tip 字节一致、2922529 同步笔自动 drop；smoke.ts/app.css 零冲突各段落位；验证：typecheck 双绿 + env -u vitest 124 files/2175 全绿，泄漏轮 1 例假失败已取证）。main 已推进至 fc439a0。剩余：139（实现/取证中）。
- 23:0x [验收 139] 实现完成报告已收：t139-heatmap-rework（实现 60c0832，翻票 44b89b5）。三模式日格重修：52 周×7 日贡献图网格（列=周行=日左旧右新）、四蓝配色+空格 #E8E8E8、周日首行序（Monday-first 与帧数据矛盾实证）、daily 卡=格上方居中/weekly+cumulative 卡=当周列顶上方居中+列环；三帧跨模式数据互斥→帧只校准构图/配色/卡/锚位/窗口。smoke 8 检查点前移位取证全绿后复原（单一插入块）；预存环境类失败（t105/t132/menu_surface）stash 基线 A/B 留档。六帧 u1–u2d 已随 60c0832 提交。**发现：工作区未跟踪（t139-progress + 12 张 z19 取证 zoom 帧 + visual-t139/ 运行副本）→ merge-gate 拒 dirty + t135 先例证据须随分支提交 → 已 resume 实现者（run 3155a5f6）bookkeeping：提交取证证据/删除字节一致的运行副本/工作区全净。完成后派双轴评审。
- 23:2x [bookkeeping 139 ✅] tip 5338e64：取证证据 chore 提交（t139-progress + 11 张 zoom 放大帧——票 Comments 引用链齐全）；visual-t139/ 运行副本 13 帧逐文件 cmp 字节一致后删除（零损失）；git status 全净。已派双轴 review-standards(b726e532)+review-spec(6069c274)（均 flash，只读，diff aaed3d6..5338e64 = 35 文件 773+/410−）。
- 23:5x [评审 139 spec] **fail**（实质缺口一处）：visual 六帧错位——md5 实证 u1≡u1b/u2≡u2b/u2c≡u2d 三对字节相同（基线帧无此异常，系本票运行新异常）；读图实证帧序错一格（u2b 实为 Daily+卡无列环；u2c/u2d 实为 Weekly；cumulative 两帧与 weekly 常态均不存在；Through 卡任何帧未出现）——capture 时序问题（capturePage 滞后），cumulative 模式零帧覆盖。其余全立：Seam-1 三表落地+表驱动覆盖、smoke 非恒真+stage 非死代码+单一插入块属实、披露①③④成立（④获像素复核支持：悬停列顶泛化正当）、周曰首行序独立成立。Notes：drill 列起点 Monday→Sunday 实质变更票面未授权（轻微）；t125 leftmost-outline 回归断言被静默移除；aggregate.heatmap.weekly 死数据。建议：修 visual-usage capture 时序重出六真帧，代码可保留。等 standards 轴后一并进修复轮。
- 23:6x [评审 139 standards] **pass-with-notes**（0 阻断/0 major/2 minor/2 nit）：①charts 三表单遍折叠纯函数、Q4=B 退役干净（weekly 单日列全删/mondayOf 移出/CSS 删）②sundayOf 对偶命名 ✓③HeatmapView 零 useEffect+t125 禁令遵守（渲染期失效）④smoke stage 单一终位+fail never+断言守卫无死代码⑤测试覆盖齐（年首/月标让位/三模式卡）⑥零契约/全英文/无 TODO。minor：smoke 本地 sundayOf 与 dates.ts 导出重复；aggregate weekly/cumulative 半数增量现仅测试消费。nit：showHover 两分支形状重复；dates.ts 未留行序取证推演。全量 vitest 2181 复跑绿。
- 23:7x [修复轮 139 派发] spec fail + standards notes 合并处置，已 resume 实现者（3155a5f6）：①必改=capture 时序修复+重出六真帧（md5 两两不同+读图自验模式/卡/锚位/列环；u3–u9 连带检查）②smoke sundayOf 改 import 消重③票披露②措辞修正（drill Monday→Sunday 系本票实质变更）④dates.ts 补行序取证注释⑤t125 leftmost-outline 断言退役理由/等价恢复⑥aggregate 死数据留档。完成后 vitest/typecheck/visual 复绿+票 Comments 记录。
- 00:1x [修复轮 139 ✅+抽查] tip 65d14b6（修复 4cece38：根因=窗口后台节流未关——visual.ts 有先例而 usage harness 漏了，capturePage 恒返上一帧；修法=setBackgroundThrottling(false)+每帧 8s settle-poll DOM 期望态+丢弃式合成器刷新捕获）。13 帧 md5 两两不同；u3≡u4≡u5≡u6 异常消除；u1b/u2b/u2d 逐帧读图自验过（daily 卡格上方居中/weekly This week+列环列顶/cumulative Through+列环）。主 Agent 抽查：setBackgroundThrottling+settle-poll 落地、sundayOf 改 import、leftmost_outline_ok 等价断言恢复（smoke.ts:11973）、披露②措辞修正、六帧 md5 全不同；主会话模型不支持读图→改用代码级验证（harness 每帧捕获时断言 DOM 期望态：u1b=Daily+卡无 This week；u2b=Weekly+This week+无 Through+列环；u2d=Cumulative+Through+This week+列环）——比目检更强的证据。vitest 2181 绿/typecheck 绿/工作区全净。**双轴闭环→已派 139 合并（根工作区，run 07d2de9f）**。
- 00:4x [合并 139 ✅] merge sha **eb8e1be**（票同步 a6f124e，blob 与分支 tip 字节一致；rebase 5 提交：代码文件零冲突全 auto-merge，票文件两处 Status 冲突取 tip 侧，65d14b6 bookkeeping 笔 drop 零丢失；双保全验证：重写 tip vs 原 tip diff 恰为 main 侧 t138 变更，t139 usage_heat 段 15 处与既有全部票段俱在；验证：typecheck 绿 + env -u vitest 124 files/2181 全绿）。**终验修复轮两票（138/139）全部并入 main，HEAD=eb8e1be**。进入收尾：全量回归 → §7 收口 → Linear 同步 → 总报告增补。
- 00:5x [回归·vitest] 根区 main@eb8e1be：env -u vitest 124 files / 2181 tests 全绿 ✓。
- 00:6x [回归·smoke:host] 两跑抖动谱系复现：跑 1 死 Round A agent_end 超时；跑 2 过 A 死 **Round L**（ticket-112 兼容轮：「Stored session working directory does not exist: .worktrees/wt-105-terminal-focus」——终验两跑死于 A/K 从未到达过的新段）。零交集实证：host-contract-smoke.mjs 与 tui-086-session.jsonl 自 base aaed3d6 零改动；fixture 存的 cwd 指向已不存在的 wt-105（1.8 开工自查时已无此 worktree）→ 判定性环境死。补空目录后跑 3：**全套 PASS exit 0 零 FAIL**（A 与 L 均过）。临时目录已 rmdir 零残留。**smoke:host = PASS（环境注记：fixture 存机器绝对路径，需 wt-105 目录存在；fixture 路径卫生候选票留操作者）**。
- 00:8x [回归·smoke:electron] 三跑：跑 1 死 t132 boot ⌘J（焦点族）；跑 2 过 t132→**menu_geometry（138）5/5 绿**→**usage_heat（139）10/10 绿**→mcp 诸段绿→死 t89 OAuth 外开竞态（预存族，139 基线 A/B 同死留档）；跑 3 menu_geometry 再 5/5 绿→死 t105 受信键回显（焦点族，未达 usage_heat）。**结论：两票交付段在终位全套均实证绿；三死点（t132/t89/t105）全为已留档预存 flaky 族，零交集；全套单次 ALL GREEN 在操作员活跃期不可得（批次既有结论），安静窗口复跑留操作者。**
- 01:0x [Linear 同步 138/139] 沿 §6 通道（mcp.linear.app OAuth 有效）：**138 → LIA-148**、**139 → LIA-149**（均 Done / label iter:1.8 / 项目 PiCode / 描述=同步头+票面全文+主 Agent 评审记录）。https://linear.app/liaokc/issue/LIA-148 · https://linear.app/liaokc/issue/LIA-149

### §7-A 终验修复轮总结（两票）

| 票 | 分支 tip | 合并 sha | 评审 | 修复轮 | 帧对照留档 |
|----|---------|---------|------|--------|------------|
| 138 | 2922529（实现 2d4406f） | **fc439a0**（票同步 38e8c57） | 双轴：spec pass（2 非阻塞备注）/ standards pass-with-notes（0阻断/0major/2minor/2nit） | 0 | mg1–mg5 帧 .scratch/visual/；对照结论=两分离卡不同高 106vs137、groove 6.0、model 顶贴悬停行、卡底贴 chip 上缘 hug 2.0、左缘对齐 chip——z19-menu-1/2 构图一致 |
| 139 | 65d14b6（实现 60c0832 + 修复 4cece38 + 证据 5338e64） | **eb8e1be**（票同步 a6f124e；rebase 重写 tip f345c93） | 双轴：spec **fail**（六帧错位）→修复轮闭环；standards pass-with-notes | 1（capture 时序：后台节流未关→setBackgroundThrottling(false)+每帧 DOM settle-poll；13 帧 md5 两两不同；随修 sundayOf 消重/leftmost-outline 等价断言恢复/披露②措辞） | u1–u2d 六帧 .scratch/visual/ + 11 张 z19 取证放大帧 work-notes/；对照结论=52周×7日贡献图、周日首行序、四蓝配色、daily 卡格上方居中/weekly+cumulative 卡当周列顶上方居中+列环（This week/Through）——z19-heatmap-* 六帧构图一致 |

**回归结论（main@eb8e1be）**：vitest 124 files/2181 全绿（env -u）；smoke:host 全套 PASS（三跑：A 超时→L fixture 路径环境死→补空目录后零 FAIL 全过；Round L=fixture 存已删除的 wt-105 绝对路径，1.8 开工前即存在的环境事实，零代码交集，fixture 路径卫生候选票留操作者）；smoke:electron 三跑 t132/t89/t105 全为已留档预存 flaky 族零交集，两票交付段（menu_geometry 5/5 两跑、usage_heat 10/10 一跑）终位实证绿。

——§7 终验修复轮毕。两票合并、回归、Linear、留档齐备。停下等操作者（不打 tag、不 release）。

## §7-B 终验修复二轮（操作者 npm run dev 反馈 · 2026-09-23 启动）

操作者再跑 npm run dev 反馈四处修订（模型累积用量界面）：①weekly/cumulative 悬浮格去更深色框（只留列环）；②52 列×7 行恒满显不左右滑动（展示维度≠统计维度，cumulative 仍全期累计）；③曲线固定一周（退役 7/30 切换）；④圆环固定一周（退役 t124 全期口径）。主 Agent 立票 140 入 main（8e62d2d，intake 惯例单笔）。现状取证：①=button.heat:hover 1.5px 与列环叠加；②=.heatmap-scroll overflow-x:auto；③④=UsagePage range-row + modelTotals 全期圆环。参照帧沿用 z19-heatmap-*。
- 01:3x [派工 140] 工区 wt-140-usage-fixes 基于 main@8e62d2d + npm install 完成；实现 subagent 已派（run e2d5bd18，bella/GLM-5.3-flash:max / fresh / 3h / async），任务文本=票面+条款 A–D+批次环境事实+实现指引（CSS 去叠加框/满显 flex 网格/固定 7 天窗/trendView(7) 复用/settings-model additive 保留/visual+smoke 断言更新+t139 settle-poll 保全）。
- 02:0x [看护 140] watchdog 报 bash 240s——实为 electron smoke 在跑；worker 正处置 t105 段负载型焦点族抖动（该段自带 suite-load echo race 注释），已按取证路径扩展重跑。行为正常，不干预。
- 02:5x [验收 140] 实现完成报告已收：t140-usage-fixes（tip f133c59，21 文件 360+/170−）。四处全落地：①列环 parity 规则（悬浮格与同列兄弟 outline 一致，daily 1.5px 深框+键盘 focus 保留）②52 列满显（去 overflow-x、flex 分摊+aspect-ratio 方形、无最小列宽地板；窗前携带语义测试锁定）③曲线固定 7 天（range-row 退役、settings-model 零改动）④圆环固定 7 天（新共享纯函数 modelWindowTotals/usageWindow 与 trendView 同窗，先滤后切保留，五张统计卡全期不动）。vitest 2185 绿（+4 新测试）/typecheck/eslint 绿；visual 11 帧全过+读图自验；smoke 两 usage 阶段全绿（新 usage_range_row_retired_ok）。披露：全量 smoke 被预存 t132（stash 基线 A/B 取证）/t105/t89 提前 abort；t44 规范前移位取证后复原。主 Agent 抽查：t132/t105 fail() 原样在位、零 log-and-continue 残留、工作区全净。已派双轴 review-standards(4d056d6a)+review-spec(c1c7c319)（flash，只读）。
- 03:1x [评审 140 standards] **pass-with-notes**（0 阻断/0 major/0 minor/4 nit）：①parity 选择器最小正确（specificity 根因核实，:not(:focus-visible) 守卫必要且无误伤，daily 不受影响）②t125 4px padding 保全+flex 组合正确 ③usageWindow 抽取消重干净、trendView 纯重定向等价、零契约增量 ④prop 链干净 ⑤新断言非恒真、t139 保全、t132/t105 fail 原样零残留 ⑥新 4 例有效。nit：30 分支保留（additive 支撑）/cost 占位注释约定/probe null 防御/注释编号。
- 03:3x [评审 140 spec] **pass-with-notes**（验收①②③④⑥全立，⑤有残留）：帧对照逐项实证（u2b/u2d 悬浮列环一致无深框、u1b daily 深框保留、52 列满显对照 z19、曲线 7 天轴、圆环窗口份额≈100%、五卡全期 103.84M≠窗口 45M、期初携带两测试原样锁定、settings-model 零改动、t132/t105 fail 原样零残留）。**两项部分实现**：①退役 u7/u8 帧 harness 退役但 tracked PNG 仍留 HEAD（展示已退役 UI）②窄窗收缩无专门窄宽帧/断言（CSS 机制保证，探针仅 1440 宽）。超范围无（SettingsWindow 1 行=prop 移除在授权内）。**双轴均 pass-with-notes 但两项证据补强轻量→已派修复轮（resume e2d5bd18）：git rm 两张退役帧+窄宽探针/帧。**
- 03:5x [修复轮 140 ✅] tip 4eedf5a（修复 b69c5b5）：①u7/u8 两张退役帧 git rm 入提交（Bin→0 bytes 确认）②u10-usage-narrow 帧落地（harness 运行时放宽窗口最小宽→760×900，settle-poll 探针：364 格全渲染/scrollWidth≤clientWidth+1/网格填满容器不溢出；拍后恢复原始几何，后续帧 1440×900 不受影响；window-options.ts 未触）。产品源与 f133c59 字节一致（仅 harness+帧+票/账本）。harness 12 帧 exit 0；vitest 2185 绿；typecheck 绿；工作区全净。**双轴闭环→已派 140 合并（根工作区，run 5e2e92bd）**。
- 04:0x [合并 140 ✅] merge sha **34c6caa**（票同步 249311c，blob 两侧 sha256 一致；rebase 仅票文件一处冲突取 tip 侧、4eedf5a bookkeeping 笔 drop 零丢失、重放后树与原 tip 逐字节一致；smoke/visual-usage/CSS/UsagePage/aggregate/tests/帧零冲突，多票段 grep 确认俱在；u7/u8 已从 main 删除、u10 入 main；验证：typecheck 绿 + env -u vitest 124 files/2185 全绿）。**终验修复二轮（140）并入 main，HEAD=34c6caa**。进入收尾：回归 → Linear（LIA-150）→ 报告。
- 04:2x [回归·二轮] 根区 main@34c6caa：vitest 124 files/2185 全绿（env -u）✓；smoke:host 全套 PASS exit 0 零 FAIL（Round L 仍需 wt-105 目录占位——既有环境注记，跑后清理）✓；smoke:electron 两跑同点死 t132（操作员活跃期焦点族稳定复现——与操作者交互时段重合；140 worker 已 stash 基线 A/B 证明预存，且合并树与分支 tip 字节一致→分支上 usage_hover/usage_heat 两阶段全绿证据直接继承）。止损：不空转；安静窗口全套复跑留操作者。
- 04:3x [Linear 140] 沿 §6 通道：**140 → LIA-150**（Done / iter:1.8 / 项目 PiCode / 描述=同步头+票面要点+主 Agent 评审记录）。https://linear.app/liaokc/issue/LIA-150

### §7-B 终验修复二轮总结（票 140）

| 票 | 分支 tip | 合并 sha | 评审 | 修复轮 | 帧对照留档 |
|----|---------|---------|------|--------|------------|
| 140 | 4eedf5a（实现 f133c59 + 修复 b69c5b5） | **34c6caa**（票同步 249311c） | 双轴均 pass-with-notes：standards 0/0/0/4nit；spec 验收全立+两项部分实现 | 1（退役 u7/u8 tracked 帧 git rm；u10 窄宽 760×900 满显探针/帧） | u1–u6/u9/u10 帧 .scratch/visual/；对照结论=悬浮列环一致无深框（u2b/u2d）、52 列恒满显（u1/u10 对照 z19）、曲线 7 天轴、圆环窗口份额；u7/u8 退役删除 |

四处交付：①列环 parity 规则（daily 深框/键盘 focus 保留）②52 列满显 flex（窗前携带锁定）③曲线固定 7 天（range-row 退役、settings-model 零改动）④圆环固定 7 天（modelWindowTotals/usageWindow 同源同窗，先滤后切保留，五卡全期不动）。回归（main@34c6caa）：vitest 2185 绿 / smoke:host 全套 PASS / smoke:electron 死点均为已留档预存族。

——§7-B 终验修复二轮毕。停下等操作者（不打 tag、不 release）。

## §7-C 发布门彩票与票 141（2026-09-23）

- 04:4x [发布·v1.8.0] 操作者验收通过，指令：打 tag → 发布 → 替换本地 app。版本 bump `6ab00fe`（chore(release): 1.8.0，沿 v1.7.0 惯例）+ annotated tag v1.8.0；无 git remote（发布=本地打包安装）。
- 04:5x [package:verify 六跑彩票] 跑1死 t124 usage fixture →定位**真 harness 缺陷**：`openLaunchArgs` 漏配 `PICODE_FAKE_USAGE=1`（electron-smoke.mjs/run-all.sh 都带；v1.7 时代该段不存在故未暴露）→ 修 `30eb3a1`。后续五跑：t89 ×2（log=[]）、t105 ×2、t132 ×1。跑 2/6 合并实证：1.8 全部验收段（menu_geometry/range_row_retired/zero_filter_fixed_window/heat 10 段）+ MCP 全段含 OAuth 端到端交换（mock 侧 GET /authorize→POST /token，auth_completed）在打包产物上全绿。
- 05:0x [根因·t89 确定性回归] 机制链：smoke 在 t89 段开始才把垫片目录前置进主进程 PATH（smoke.ts:12998）→ `hostForkEnv()`（spawn-path.ts:161）用**启动时冻结的 composedCache** 覆盖 fork PATH → t89 段新建会话的 host 拿不到垫片 → 适配器 pi.exec("open") 解析真实 /usr/bin/open → 浏览器打开授权 URL（OAuth 照样完成）但垫片 open.log 恒空 → 断言必死。**引入点=票 134**；139 轮 A/B 基线已含 t134 故误判为环境竞态族。v1.7.0 时代 host fork 直接继承 process.env，垫片生效——非竞态，是确定性回归。另根因 t132/t105 leg1：焦点断言无窗口焦点前置（Chromium 失活→activeElement=body；t44/t105 leg2 已有保险模式，两处裸奔腿未接）。
- 05:1x [立票 141] `.scratch/picode-1-8/issues/141-verify-t89-shim-focus.md` 入库 `949b2fa`：R1 spawn-path 改「缓存事实+读取时活组合」（t134 no-degradation 次序契约不变）+ R2 smoke 抽 ensureWindowFocused 补三处（断言零改动）+ tests/main/spawn-path-live.test.ts。工区 wt-141-verify-fixes 已建（npm install 完）；实现工已派（run 82e89166，flash）：实现→typecheck/eslint/vitest（env -u）→ electron-smoke 取 t89 段直接证据（mcp_oauth_autocomplete_ok 哨兵，≤2 重试）。合并后安静窗口重跑 package:verify，过则 tag 重指合并后 HEAD 并安装替换本地 app。
- 05:4x [实现 141 ✅] tip `a7e3a66`：R1+R2 落地；顺带修复 main 上两处既存红（package-verify-launch.test.ts 期望滞后 30eb3a1、package-lock 版本漏同步 6ab00fe）。验证：typecheck/eslint 绿；env -u vitest **125 files/2188 全绿**（+3 新）。**t89 直接证据**：dev smoke 跑 3 `SMOKE mcp_oauth_autocomplete_ok http://127.0.0.1:50907`——t134 以来首过；sanitized t134 段 exit 0（18 entries vs bare 4，无降级契约保全）；跑 4 死 t119（背景流式负载下时序段，非确定性签名，原文披露未动断言）。t90/t119 为新暴露时序段，证据留 /tmp/t141-smoke-3/4.log。
- 06:0x [评审 141] 双轴：standards **pass-with-notes**（2 minor：恒真断言判断性意见+lock 同步宜补记；3 nit；零 must-fix；红线全过：shared 零改动、helper 与 t44 块逐字等价、断言文本零改动）；spec **pass**（R1/R2 逐项落地、超范围两处均必要且披露、无实现错误）。
- 06:1x [合并 141 ✅] 票同步 `de860a7` → merge **`aab20a3`**（rebase 零冲突，实砥笔重放 `77184fc`；树与分支 tip 字节一致；env -u vitest 125 files/2188 全绿；5 文件 156+/40−）。**main HEAD=aab20a3，进入发布门重跑。**
- 06:2x [发布门·7/7b] 跑 7（工具 10 分钟窗口截断，仍在跑=早死点全过）；跑 7b（nohup 后台，14:25-14:33）：**焦点腿全过（141 R2 生效）**，死新点 **t91**（`the overlay never closed via the mask-blank click exit`，363 哨兵；Space/❌/Escape 三腿全过唯 mask-blank 死）。
- 06:3x [根因·t91] closedIntact91（smoke.ts ~9666）open 检查为**单次快照**——本段其余断言全有 5s settle-poll 唯独它没有；真鼠标 mouseDown→60ms→mouseUp 后立刻采样，渲染负载下 React 提交晚于快照 → 误报。同段 runs 2/6、dev 跑 3 均过 = 间歇。另据 141 实现工披露：t90（live 徽章 10s 探针死，桥接 roundtrip 已解）与 t119（底钉漂移，背景 24 连 thinking_delta）为被 t89 掩蔽的到达即死段。
- 06:4x [立票 142] `.scratch/picode-1-8/issues/142-verify-t91-t90-t119.md` 入库 `e2c00ae`（含彩票地图）：R1 t91 settle-poll 机械修；R2 t90 诊断+修复授权（分页复位/前送/增强三假说，前移位取证）；R3 t119 同（settled 前提违反 vs pin 闩真缝）。工区 wt-142-verify-lottery 建好；实现工已派（run 6588c580，flash）：实现→验证→smoke 越过 t90/t119 取证。
- 07:0x [Linear 同步] 操作者指令：全部工单同步 Linear。141 → **LIA-151**（Done）；142 → **LIA-152**（In Progress）。核对 LIA-148/149/150/151/152 = 138/139/140/141/142 全在位。
- 07:2x [实现 142 ✅] tip `ab669b1`（R1 `006c4f0` + R2 `ab669b1`，5 文件 66+/17−）。三项定论：**R1** t91 单快照→5s settle-poll（四退出腿共享，语义不放宽）；**R2 t90 根因=确定性环境泄漏**（从 subagent 会话驱动的跑继承 `PI_SUBAGENT_CHILD=1` → pi-subagents 按契约拒注册 → fleet RPC 无人应答 → 桥接答 available:false（工件 runs 照常携带）→ foldSubagentStatus 弃折 → DOM 恒 Lost；套件级 A/B 铁证：diag3 avail:false+Lost → final1 rebuild lost=0）——修复 = hostForkEnv() 剥离 PI_SUBAGENT_CHILD/PI_SUBAGENTS_HERDR_BRIDGE + electron-smoke.mjs/run-all.sh 启动侧净化；对操作者终端零行为变化。**R3** t119 环境时序彩票（三跑两绿一红，run4 dump 排除流式假说，无可证 pin 闩破绽）——断言零改动不修，证据留档。验证：typecheck/eslint 绿；env -u vitest **125 files/2189 全绿**（+1）；临时取证零残留（grep TEMP 全 0）；**dev smoke 全套 ALL GREEN（SMOKE done、714 哨兵、零 FAIL，/tmp/t142-final1.log）**——批次首次全套单跑全绿；t119 全腿 + t90 真断言（live_running/live_completed/rebuild ended=25 completed=25 lost=0）全过。
- 07:4x [评审 142] 双轴：standards **pass-with-notes**（1 minor：marker 名跨文件重复可导出常量；2 nit：OverlaySample91.open 死字段、测试清理顺序；零 must-fix，红线全过）；spec **pass**（R1 四腿 settle-poll 语义不放宽实锤、R2 拒注册/弃折机制 file:line 属实、hostForkEnv 唯一咽喉；1 partial：独立探针日志缺档但套件级 A/B 定论成立；note：R2 动产品代码 spawn-path.ts 已标注=env 语义修复）。
- 08:2x [合并 142 ✅] 票同步 `8716557` → merge **`77f1eb3`**（rebase 零冲突、票同步笔 patch-id 一致自动跳过零丢失，实砥笔重放 6d032b5/9a5f543；树与分支 tip 字节一致；env -u vitest 125 files/2189 全绿）。**main HEAD=77f1eb3，进入最终发布门。** LIA-152 待置 Done。
- 08:3x [LIA-152 置 Done] Linear 同步（双轴评审通过+合并完成）。
- 08:4x [发布门全绿 🎉] package:verify @ main 77f1eb3（nohup 后台，16:24-16:33）：**SMOKE done、712 哨兵、零 FAIL——`PACKAGED ARTIFACT VERIFIED`，批次以来打包门首次完整通过**（141 R1/R2 + 142 R1/R2 修复后彩票全清：焦点腿、t91、t89、t90、t119 全链在打包产物上一次跑通）。
- 09:0x [发布 v1.8.0 ✅] ①tag 重指：v1.8.0 → **77f1eb3**（原 23e9992 删除重打，annotated，发布树=验证树）②本地 app 替换：旧版备份 `/Applications/PiCode 1.7.0.app`（沿 1.6.0 惯例）→ `ditto` 安装 → `/Applications/PiCode.app` CFBundleShortVersionString = **1.8.0**，无 quarantine 标记，零运行实例干扰。产物链：release/PiCode-darwin-arm64/PiCode.app（Electron 44.0.0 + SDK 0.86.1 + pi-ai 对齐核验在打包脚本内置）。

### §7-C 发布收口总结

| 票 | 内容 | sha 链 | 状态 |
|----|------|--------|------|
| 140 | usage 终验二轮（四处修订） | 8e62d2d → f133c59/b69c5b5 → merge 34c6caa | 已发布 |
| 141 | t89 冻结 PATH 回归 + 焦点前置 | 949b2fa → a7e3a66 → merge aab20a3 | 已发布 |
| 142 | t91 settle-poll + t90 环境泄漏 | e2c00ae → 006c4f0/ab669b1 → merge 77f1eb3 | 已发布 |
| 30eb3a1 | package verify 漏配 FAKE_USAGE 修复 | main 直修 | 已发布 |
| 6ab00fe/23e9992→77f1eb3 | 版本 bump + tag v1.8.0 重指 | main | 已发布 |

发布证据：打包门全绿（712 哨兵）+ vitest 2189 + smoke:host 全套 PASS + dev smoke 全套 ALL GREEN（714 哨兵）。遗留：t119 残余时序不确定（R3 留档，断言未动）；ticket-79/70/83 同类环境焦点族在操作者输入密集期仍可能偶发（既有分类）；host Round L fixture 机器路径候选票仍留操作者。

——v1.8.0 发布毕。PiCode 1.8.0 已装入 /Applications。

- 09:2x [卫生票 143] 操作者批准：Round L fixture 机器绝对路径卫生票立案 `.scratch/picode-1-8/issues/143-host-roundl-fixture-cwd.md` 入库 `ba731fa`；修法 = 播种时把 session 头 cwd 重写为 seedDir086（fixture 文件零改动，census/closeout 零影响）；验收 = 零人工前置 smoke:host 全套 PASS。Linear：**LIA-153（Todo）**。待派工。
- 09:4x [143 执行指令] 操作者：实现→合并→重新发版；问询是否需全量测试；项目已关联 GitHub，授权推送；**约束：所有工单发布/执行等状态变更必须同步 Linear**。测试范围判定：vitest 全量（必，便宜）+ smoke:host 全套（必=本票改动面）+ smoke:electron/package:verify（**不必**——改动仅 scripts/smoke/host-contract-smoke.mjs，不在 app 打包面，以 git diff 源码同一性证明既有 PACKAGED ARTIFACT VERIFIED 证据承接）；app 重装判定：源码同一→产物字节一致，已装 1.8.0 无需重装。发布动作 = tag 重指 + git push（远端待核对）。LIA-153 置 In Progress。
- 10:0x [Linear 镜像纪律落库] 操作者质询后补正：规则本体写入 `docs/agents/issue-tracker.md` § Linear mirror (mandatory)（提交 `e0e2599`）——intake→Todo / 派工→In Progress / 评审记录追加 / 合并→Done / 发版记录，本地未关账=Linear 未同步；run-log 事件留痕 + LIA-153 In Progress 执行首例。
- 10:4x [实现 143 ✅] tip `af54549`（+25/−0 仅 host-contract-smoke.mjs 播种处：首行 session 头 cwd→seedDir086 重写，键序保留，形状漂移即 fail，其余行字节不动，fixture 零改动）。验证：零占位目录前提下 smoke:host **全套 PASS exit 0**（Round L：seeded opened/replay 210/tree 270/**shutdown 271/271 byte-identical**）；vitest 2189 绿；eslint 绿。**披露**：跑 1 死 Round K = worker 会话 PI_SUBAGENT_CHILD 泄漏 × host-contract-smoke.mjs forkHost()（408-415）未剥标记——142 R2 修复未覆盖的直 fork 口；干净 env（-u 三变量）全套过。候选微票：forkHost 剥离（发版后立案）。
- 11:0x [评审 143 + 修轮] 双轴：standards **approve**（0 must-fix/2 minor/2 nit）；spec **pass**（0 must-fix/0 partial/2 note；披露评估成立——Round K 死属调用方 env 泄漏 pre-existing，不影响 Round L 验收）。修轮 `d2c802b`（主会话直修，139 簿记先例）：①payload 注释更正（<cwd> 在 line-4 system preamble 非工具结果）②可逆性守卫（round-trip 只改 cwd，escape 静默重编码响亮失败）。修轮验证：vitest 2189 绿 + smoke:host 主会话直跑全套 PASS exit 0（wt-105 零占位）。
- 11:2x [合并 143 ✅] 票同步 `af0fefc` → merge **`98d2142`**（rebase patch-id 一致自动跳过零丢失，实砥笔 2/2 重放 b32f178/5383bd2；产品源与分支 tip 字节一致；env -u vitest 125 files/2189 全绿）。
- 11:3x [发版 v1.8.0 最终态] ①源码同一性证明：77f1eb3→98d2142 全差异 = 票面/流程文档/smoke 脚本 3 文件，**src/ 与打包输入零字节差异** → app 产物不变，77f1eb3 的 PACKAGED ARTIFACT VERIFIED 证据承接；已装 /Applications/PiCode.app（1.8.0）无需重装。②tag v1.8.0 重指 **98d2142**。③**git push origin main --tags**：main 98d2142 + tags v1.5.0/v1.6.0/v1.7.0/v1.8.0 上远端（github.com:Liaokc/PiCode）。④Linear：LIA-153 → **Done**。⑤候选微票 144 立案入库 `ed6db85`（forkHost 剥离 PI_SUBAGENT_CHILD，142-R2 补充；smoke:host 直 fork 口）→ **LIA-154（Todo）**，已推送。

### §7-D 发布终态（v1.8.0）

| 项 | 值 |
|----|----|
| 发布树 / tag | **98d2142**（v1.8.0，annotated，已推 GitHub） |
| 打包门证据 | PACKAGED ARTIFACT VERIFIED @ 77f1eb3（SMOKE done、712 哨兵零 FAIL）+ 源码同一性承接至 98d2142 |
| 本地 app | /Applications/PiCode.app = 1.8.0（旧版备份 PiCode 1.7.0.app / 1.6.0.app） |
| 票 140/141/142/143 | 全部合并入发布树；LIA-150/151/152/153 全 Done |
| 微票 144 | forkHost 剥离（LIA-154 Todo，待派） |
| 推送 | origin = github.com:Liaokc/PiCode；main + 全部 tag 已推 |

——v1.8.0 发布+推送毕。等操作者下一步指令（144 派工与否）。
- 12:0x [终态指令] 操作者：以发版树重打包替换本地 app，清理 worktrees（旧红线「保留工区」由本指令解除）。执行：npm run package（main 当前树 = 98d2142 同源，app 输入零差异）→ 替换 /Applications/PiCode.app；六工区（wt-138/139/140/141/142/143）逐个验净后 remove + 已合并分支删除；LIA-153 补记终态。144（LIA-154 Todo）仍留待派。
- 12:1x [替换+清理 ✅] ①重打包（bundled SDK 0.86.1 / pi-ai 0.86.1 verified）→ ditto 替换 /Applications/PiCode.app（1.8.0）。②worktrees 全清：本轮 6 工区验净 remove；1.8 批早段 22 工区（wt-116–137）20 个净 remove + 2 个含未跟踪证据帧（wt-119：7 张 c119-*.png；wt-125：visual-t125/）先归档 `.scratch/retired-worktree-evidence/` 再强删；`.worktrees/` 目录移除；28 条已合并分支（t116–t143）全部删除，余 main；`git worktree list` = 仅根。旧备份保留：/Applications/PiCode 1.7.0.app / 1.6.0.app。
- 20:4x [145 README 品牌升级 ✅] 操作者指令：README 像高星项目一样升级（中文版/logo/图片）。①研究员（知识库调研，web 工具不可用已披露）产出 `.scratch/readme-research-brief.md`：12 段黄金骨架/双文件互链/真实 badge/emoji features/hero 第一屏。②图像精选工（多模态读图）从已提交视觉帧选 hero（3-expanded 完整工作台）+ 7 特性图 + logo（build/icon.png 1024²），复制入 `docs/assets/`，附中英 captions；review-diff 类无好图留待补拍。③License 操作者授权「你决定」→ MIT（LICENSE + package.json，`2327b02`）。④README.md 重写：居中 logo+tagline+4 badge（MIT/动态版本 tag/macOS/node≥24）+语言行+痛点定位（Handoff/Live Follow）+hero+emoji Features+截图网格+Quick Start（含打包）；工程段落全保留（Architecture/Development/smoke 六阶段/Visual QA/Packaging）——AGENTS.md 交叉引用锚点不破。⑤README.zh-CN.md 全文中文镜像互链。⑥提交 `98d4011` 推送 GitHub。⑦本地 Electron 离屏渲染双版预览截图 `.scratch/visual/readme-preview-{en,zh}.png`（@2x）。LIA-155 = 145。
