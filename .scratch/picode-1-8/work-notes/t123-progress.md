# Ticket 123 progress — 死 cwd 组沉底（组排序活性桶）

**本票目标一句话**: shared/sessions/group.ts 的 Projects 视图组排序加活性桶——死 cwd 组（cwd-liveness 既有判定，组级复用）在 Updated/Created/Manual 三排序下恒沉底（组间仍按各自排序键），Manual 手动序对死组不生效，灰行与手动排序持久化不回退，活性翻转即重投影。

- 2026-09-22 开工：阶段=开工。已读票面 123-dead-cwd-group-sink.md（Status=ready-for-agent，Acceptance 四项）；已读 CONTEXT.md（术语权威：Manual 排序/筛选下拉、灰行词条）；已读 spec.md R8。代码取证：src/shared/sessions/group.ts（bySortOrder 仅 updated/created/manual 排序键，无活性桶；manualOrderedGroups 的 unknown 分支忽略已存行序——潜在票 84 缺陷）、src/shared/sessions/cwd-liveness.ts（cwdMissing 注记=纯文件夹事实，组级可复用）、src/shared/sessions/reorder.ts（snapshotManualOrder/moveGroupBefore）、src/renderer/src/components/Sidebar.tsx（grip 拖拽 + drop 锚点 + manualBase）、src/main/sessions/index-service.ts（list 时注记 cwdMissing，cwd 活性入 cacheSignature→翻转即 onIndexChanged，纯反应式）。
- 2026-09-22 修复落地（实现完成，待验证）：
  - src/shared/sessions/group.ts：+isDeadCwdGroup（组内任一行 cwdMissing===true 即死，纯文件夹事实）；groupSessions 自动排序路径 partition（活组按键→死组桶按键）；manualOrderedGroups 重写为 storedLive/unknownLive/dead 三段（死组一律入桶按 Updated 基线），unknown 分支改用 manualOrderedRows（修复存序行被忽略的潜在票 84 缺陷——排除死组入 groups 后该路径成为必经）。
  - src/shared/sessions/reorder.ts：snapshotManualOrder 的 groups 排除死组（sessions 照存——灰行照常可拖）。
  - src/renderer/src/components/Sidebar.tsx：+deadGroupCwds useMemo；死组 grip 禁用（draggable=false、无 onDragStart、sb-grip-dead 灰样式、无拖拽 aria-label）；groupDropTargetFrom 死桶锚点钳制到首个可见死组（指示器与落位一致）；commitDrop 死锚点→null + renderedCwds 仅活组。
  - src/renderer/src/styles/app.css：+.sb-grip-handle.sb-grip-dead（cursor:default + opacity .45）。
  - tests/shared/sessions-dead-group-sink.test.ts 新建（表驱动：三排序×死活混合、活性翻转、warning 态仍沉、置顶区不动、manual 死组不生效/活组照排/死桶 Updated 基线、快照排除、复活组按活性行先于更近的死组、灰行拖序、边界 drop、timeline manual 尾部镜像）。
  - src/main/smoke.ts：+ticket-123 stage（dead_group_sink_*，插在 dead_cwd_done 之后）：seed live+doom（doom mtime 最新、birthtime 最新）→删目录→三排序主进程 stat 边界断言→Manual 下死组 grip 拖不动（含合成 drag 无 commit）+活组拖到顶+死桶落位=活/死边界相邻→目录复现 un-dim+Updated 下回到 live 之上→sort 卫生还给 Updated。
  - CONTEXT.md：修订「筛选下拉」「手动排序」两词条（沉底规则 rider）。
  - 验证：vitest 5 文件 122 用例全绿（含新套件）；typecheck 全绿。electron smoke 待 serialization 窗口跑。
- 2026-09-22 自评审（双轴，fallback 无 subagent）：
  - Standards 轴：纯模型/胶水分层维持（group.ts+reorder.ts 纯函数，Sidebar 只做胶水，smoke/visual 断言）；零新缝（Seam-1 vitest + electron smoke + visual:cwd harness 全既有）；无 IPC 契约变更（仅消费既有 additive cwdMissing 字段）；单一拼写 isDeadCwdGroup/dead-cwd group/sink；无 TODO/占位；dragover 热路径的死桶边界收敛为 firstDeadGroupCwd memo（自评审发现的重复 find）；UI 无新增文案（死组 grip 无拖拽 aria-label）；红线零触碰（会话文件/偏好边界不变）。eslint 全绿。
  - Spec 轴（票面 Acceptance 逐条）：①Seam-1 表驱动 ✓（19 用例：三排序×死活混合×相对序、活性翻转、warning 行级豁免 vs 组级沉底、置顶区不动、manual 死组不生效/活组照排/死桶 Updated 基线、快照排除、复活组按活性行、灰行拖序、边界 drop、timeline 镜像）；②electron smoke stage 已写（dead_group_sink_*）待跑；③灰行（票 2x）与手动排序持久化（票 84）不回归：既有 suites 全绿 + 新增回归用例，票 84/42×54 smoke stage 与新代码的兼容性逐段人工推演过（84 stage 首拖快照现排除当时已死的 fold/collapse 组——其断言只查 A/B 故不受影响；step4 灰行拖序依赖 C 在快照时存活故照常）；④vitest 1988/1989 绿（唯一失败 tests/main/subagent-runner-root.test.ts 为基线同样失败的环境相关预存问题，git stash 验证），typecheck 绿，ps 自查已做。
  - 发现并修复：visual:cwd harness 补组沉底断言（cwd1 帧前断言死组 section 在活组之下）。
- 2026-09-22 smoke 结果（第一次）：日志 /tmp/t123-electron-smoke.log。票 123 stage 八步全绿（seeded/updated/created/grip_frozen/live_drag/boundary_drop/recovered/done，行 316-324）；前置 sidebar_drag_*（票 84 全 10 步）与 dead_cwd_*（票 42×54）也全绿——零回归。但后续 ticket-75（滚动锁闩，与本票 diff 零交集）失败：`scrollTop 2060.5 被拽回 2169.5 = scrollH 2824 − clientH 655（精确底部）`，2 秒探测窗未锁住——真模型流式时序敏感。关键环境事实：wt-120 的 smoke 于 2:46 启动（/tmp/t120-smoke5.log，pid 47125），与本 run（2:42 起）并发——双 electron smoke 并发的 CPU/rAF 抖动是首要嫌疑诱因；本人启动前已 ps 自查（当时无任何 electron 进程，wt-116 已结束），并发由 wt-120 侧引入。
- 2026-09-22 smoke 结果（第二次，r2）：日志 /tmp/t123-electron-smoke-r2.log。在 ticket-88（侧板预览 iframe 渲染，与本票 diff 零交集）失败：`relative resources failed (css=rgb(255, 240, 224) img=false)`——未到侧栏 stages。与 run 1 对照：同一代码 run 1 的 ticket-88 是过的 → 非确定性环境抖动。环境事实：今晚本机 smoke 排队互撞（wt-116 2:37 / wt-120 2:46 撞我 run1 / wt-116 2:56 / 我 3:04 / wt-127 ~3:10 撞我 run2），wt-120 自己的 run 也挂在 ticket-90（subagents 徽标）。两次失败点均与本票 diff 无交集且互相不同。本人两次启动前均 ps 自查（当时无 electron 进程）。计划：等窗口再试一次完整跑；若再挂无关 stage，则以「票 123 stage 全绿 + 侧栏回归 stages 全绿 + 两次失败均为无关环境抖动」如实报备。
- 2026-09-22 终态（收尾，主 Agent 指令停止进一步 smoke/dev app）：
  - r3 证据补录：r3 不仅 dead_group_sink 八步全绿（行 315-323），还通过了杀死 r1 的 ticket-75（scroll75_done 行 353）与杀死 r2 的 ticket-88（preview_dual_88_done 行 246）及 sidebar_drag_*/dead_cwd_* 全绿，最终挂在更晚的 ticket-93（scrolled-away send 落底）——与本票 diff 零交集，同夜跨分支抖动家族。
  - 提交：实现提交 d11fe2ff2b44a8126537c455f7a3c8a39d59d201（9 文件：group.ts/reorder.ts/Sidebar.tsx/app.css/smoke.ts/visual-cwd.ts/CONTEXT.md/tests+票面翻转）；tip 40e7d45aa3852b76ccce3bc2a89082c58f604f76（仅 sha 记录笔）。
  - 票面：Status=ready-for-human，Acceptance 四项勾选，Comments 含证据链 + sha。
  - 遗留：①截图未拍（收尾指令禁止再跑 app）——UI 可视（死组沉底），干净窗口跑 `npm run visual:cwd` 可得 .scratch/visual/cwd1-dimmed-row.png（现含沉底断言）；②smoke 套件同夜环境抖动（r1=75/r2=88/r3=93，均非本票改动面，主 Agent 已核）；③预存 vitest 环境泄漏（subagent-runner-root，基线同败）。
- 2026-09-22 方案选型（定稿）：
  - 组死活判据 = 组内会话的 `cwdMissing` 注记（`some`）——纯文件夹物理事实；活 host 豁免（warning 态）是行级展示豁免，不影响组沉底（操作者原话「不存在的文件夹永远排在存在的文件夹下」）。
  - group.ts：`isDeadCwdGroup` 助手 + groupSessions 三排序统一活性桶（活组按排序键 → 死组桶按同键；Manual 下死组桶按 Updated 基线=「手动序对死组不生效」）；manualOrderedGroups 死组（stored 或 unknown）一律入桶，且 unknown 分支改用 manualOrderedRows（修复「sessions 有存序但组不在 groups」时行序被忽略的潜在缺陷——本票排除死组入 groups 后该路径成为必经路径，属必要修复）。
  - reorder.ts：snapshotManualOrder 的 `groups` 排除死组（沉底是活性投影不落库，目录复现回自然位）；`sessions` 行序照存（灰行照常可拖）。
  - Sidebar（胶水）：死组 grip 禁用（draggable=false+无 onDragStart+sb-grip-dead 灰样式）；组 drop 锚点若落在死桶（死组 cwd 或越过末尾的 null）钳制到首个可见死组边界（指示器与落位一致）；commitDrop 死锚点→null（模型按活组尾落位）、renderedCwds 仅传活组（死组永不进手动序数组）。moveGroupBefore 本体零改动（Sidebar 归一化后模型只见活组 cwd）。
  - 测试：新增 tests/shared/sessions-dead-group-sink.test.ts 表驱动（三排序×死活混合×相对序、活性翻转重投影、manual stored-死组仍沉底、快照排除死组、死组内灰行拖序仍生效、死锚点→活组尾）；electron smoke 新 stage（seed live+doom 两组，doom mtime 最新→死前居上；删目录后三排序边界断言（主进程 stat 判活组，规避历史 stage 遗留死组干扰）；Manual 下活组 grip 拖至顶、死组 grip 拖不动、死桶落位=活/死边界；目录复现恢复；sort 卫生还给 Updated）。
  - CONTEXT.md rider：修订「手动排序」「筛选下拉」两词条补沉底规则。
