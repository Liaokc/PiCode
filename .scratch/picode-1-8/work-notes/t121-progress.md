# t121 progress — New Task provider 列表统一（仅已配置）

目标一句话：New Task 空态的 provider/model 菜单 provider 列表从「配置优先排序」收紧为「仅已配置 provider」（复用票 76 `configuredIds`），会话内路径零改动，modelMenuHint 三态诚实文案不回归，设置窗 Models 节维持全列表（票 76 初衷）——该解绑边界报备入票 Comments。

## 事件日志

- 2026-09-21T17:52Z 阶段=开工。已读票面 121、CONTEXT.md、spec.md R3（`sortProvidersConfiguredFirst` → configuredOnly 过滤；空列表降级 = modelMenuHint 诚实文案）。证据：`.scratch/picode-1-8/issues/121-newtask-providers-configured-only.md`、`.scratch/picode-1-8/spec.md` R3/Implementation Decisions。
- 2026-09-21T17:52Z 票 Status: ready-for-agent → claimed（worktree 副本随分支提交）。
- 2026-09-21T17:56Z 方案定稿：新增 Seam-1 纯函数 `configuredProvidersOnly`（filter 到已配置 + 组内字母序，与票 76 `byDisplayName` 同规则；configured=null 降级原序——与 sort 同诚实律）；App.tsx `newTaskProviders` 换用之；`newTaskModelMenuHint` 第三态从「catalog.providers 空」改为「newTaskProviders 空」（新增覆盖：目录非空但全部未配置 → 照显 No models configured…）；chatForView/ModelsSection/host 全不动。选「过滤+字母序」而非「纯过滤」的理由：会话内路径经 chatForView sort 后 = 字母序，New Task 要「同一 provider 集且同序」才是真会话内口径；且对已配置项零行位移（只剪未配置尾巴）。证据：src/shared/provider-sort.ts:65-83、src/renderer/src/App.tsx:1673-1683。
- 2026-09-21T17:58Z 实现落地：①`src/shared/provider-sort.ts` +`configuredProvidersOnly`；②`App.tsx` newTaskProviders 换接 + hint 第三态改看过滤后列表 + 票 76 注释块改写（设置节维持全列表、两面解绑报备）；③`src/main/smoke.ts` 空态菜单 ②b 期望值从 sortProvidersConfiguredFirst 改为 configuredProvidersOnly（断言文案 ticket-121 order…configured-only）；④`tests/shared/provider-sort.test.ts` 新增 7 例（过滤/空集/降级/字母序+id 决胜/不变异/与会话内投影同列/仅未配置时置空+piFallback=null）。
- 2026-09-21T17:59Z 验证（部分）：vitest provider-sort 18/18 绿；typecheck 双 tsconfig 清；eslint 4 文件零告警。`npm test` 全套 1976/1977——唯一 fail = `tests/main/subagent-runner-root.test.ts`「sets the env to the resolved SDK package dir」，stash 后裸分支同样 fail（本机 SDK 装在 nvm 全局路径，解析器返回全局路径），预存在环境差异、非本票改动（本票 4 文件零涉及 subagent runner）。
- 2026-09-21T18:00Z 阶段=待 electron smoke（serialization 自查后跑）。
- 2026-09-21T18:05Z smoke 运行 #1（带实现）：空态段全绿——`empty_state_menu_provider_order_ok bella,bella-local,bella-remote`（仅已配置 ✓）+ `empty_state_menu_locate_ok bella at row 0` + `menu_keyboard_model_providers_ok providers=3`（会话内同集）+ `settings_models_provider_order_ok` 全列表不回归 ✓；后续 ticket-90 段（live run badge）FAIL。
- 2026-09-21T18:12Z smoke 运行 #2（带实现）：同样在 ticket-90 段确定性 FAIL（2/2），空态/设置段同 #1 全绿。
- 2026-09-21T18:20Z 预存在验证（A/B）：stash 后在 base 50ba1b4 裸分支跑全量 smoke——ticket-90 段同样 FAIL（同失败点、同前置段全绿）；同时 base 空态列 = 44 项全目录（bella,bella-local,bella-remote,Amazon Bedrock,…），与本实现 3 项形成 A/B 实证。结论：ticket-90 失败 = main 预存在（非本票回归）；根因假设 = pi-subagents fleet RPC 回复失败 → available:false → foldSubagentStatus 整体忽略快照（subagent-bridge.ts:148 + session-registry.ts:241）——需独立立票。另：node scripts/smoke/electron-smoke.mjs 直跑需 PATH 含 node_modules/.bin，否则 spawn ENOENT 静默 exit 1。
- 2026-09-21T18:30Z 增强：smoke menu_keyboard 段新增会话内 parity 直接断言（menu_keyboard_model_parity_ok：in-session 列 == 同份缓存报告派生的 configured-only 期望；与 ②b 同模式）。typecheck/eslint 清。注意：该断言加入于末次全量 smoke 之后，待下次 smoke 实证（低风险：同 DOM 探针模式、两侧同名同源、order 同字母序规则）。
- 2026-09-21T18:35Z 收到主 Agent :q 指令：不再起第三轮全量 smoke，进入收尾。self-review 双轴通过（Standards：零新缝/零契约/命名一致/无 TODO/全英文；Spec：四项验收逐条对照，vitest 唯一 fail 为预存在环境项 subagent-runner-root——stash 裸分支同败，本机 nvm 全局 SDK 路径所致）。
- 2026-09-21T18:36Z 提交：d3dd39b = 实现（provider-sort.ts + App.tsx + smoke.ts + provider-sort.test.ts，162+/22-）；7391a91 = 票 Status→ready-for-human + Comments 实现记录/边界报备/预存在项留档。分支 tip = 7391a91。progress 文件保持 untracked。
- 终态：实现完成、验收四项全落实（vitest 项含预存在环境例外）、票已翻 ready-for-human、分支待主 Agent 跑 scripts/merge-ticket.sh 121。遗留：①parity 断言待下次 smoke 实证；②ticket-90 段预存在失败需独立调查（建议立票）；③subagent-runner-root vitest 环境性预存在失败（merge 阶段知悉：merge-ticket.sh 的 npm test 会在 main 上同样遇到）。
