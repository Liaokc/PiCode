# 147: pi-subagents 0.71 探针升位——070→071 更名 + 0.71 增量断言 + 活跑验证

**Status:** ready-for-human

**What to build:** Q8 裁决（更名 + 补断言）。调研定论（`.scratch/picode-1-8-1/research/pi-subagents-0.71.0-diff.md`）：0.71.0 对 PiCode 强制适配为零；既有探针断言在 0.71.0 全过（纯形状断言无版本钉）。本票把票 111 的 0.70 活探针升位为 0.71：

1. `git mv scripts/smoke/subagents-070-probe.ts scripts/smoke/subagents-071-probe.ts`；头部注释改写（0.70.1 → 0.71.0 live probe；票 111 起点 + 1.8.1 升位；记录三个 0.71 行为注记：dev/unpacked 动态激活 loader 先行【Q6=A 接受现状】、打包 worker 默认 fresh 上下文、async-started task/goal 脱敏——探针的 RPC 与直达命令路径均不受激活门影响，调研 §3④ 实证）；
2. `package.json` 脚本：`smoke:subagents070` → `smoke:subagents071`（esbuild outfile probe070.mjs → probe071.mjs）；
3. `src/host/subagent-bridge.ts:58` 注释里的探针路径同步改为 subagents-071-probe.ts（仅注释，bridge 零功能改动）；
4. 补 0.71 增量断言：①`ping.capabilities.cost` 广告 `{version:1}`；②status.json 字段 census 增 `steps[].externalProcess`（presence-tolerant：在场记录、缺席不失败）；③可选加一次 cost RPC 调用并校验版本化信封（version=1 + parent/children/childTotal/total/unresolvedAsyncChildren 键在场、数值型宽松）；
5. 内部 tmp 前缀 probe070 → probe071（:79-84、:110 一带）；
6. 注释刷新（轻量）：`src/main/index.ts:813` 票 134 注释与 `src/shared/subagent-sdk-alignment.ts` 头注各补一句——0.71.0 已删除 transcript-tools 硬导入（上游 #2377），地板常量维持 0.86.1/0.70.0 不变（守 0.70.x 旧装，语义仍准确）。

## Acceptance

- [x] `npm run smoke:subagents071` PASS exit 0（活跑：用户级 pi-subagents 0.71.0 × 捆绑 SDK 0.87.1，两者 package.json 实读配对证据）
- [x] cost capability 断言 + externalProcess census 在位（ping.capabilities.cost={version:1}；cost RPC 信封 version=1 + parent/children/childTotal/total/unresolvedAsyncChildren 五键在场数值宽松；steps[].externalProcess presence-tolerant）
- [x] 全仓无 subagents070 / subagents-070 / probe070 残留引用（活树 grep 0 命中；.scratch 历史取证档案按纪律保留）
- [x] vitest 全绿（env -u 三变量纪律）+ typecheck/eslint touched 绿

**Background（取证）:** RPC 七方法 handler（status/spawn/steer/interrupt/stop/resume）逐字节不变（rpc.js diff 仅新增 cost）；status.json 信封不变（steps 仅增量可选 externalProcess：async-status.js 一行展开）；四生命周期事件名/payload 键不变（child-status 增 "started" 被现有 forwardChildStatus 过滤器忽略——Q7-② 裁决留盘点）；fleet DTO 构造器逐字节相同；steer/stop 应答形状原样。票 134 根因的 review.js/permission-arbiter.js pi-ai 硬导入在 0.71.0 整体删除（watchdog 改 initialState.systemPrompt，pi-agent-core 0.86.1 原生支持）。证据索引见报告附录。

**Red lines:** 不 push/不打 tag/不 release；无产品/shared 功能改动（bridge 仅注释）；不碰 ~/.pi 环境。

**Blocked by:** 146（package.json 重叠 + 探针活跑依赖捆绑 SDK 0.87.1）。前置已满足：146 已合入 main（89528dd）。

## Comments

- 2026-09-24（implementation，ebf8e6b）：六项全落地——①git mv subagents-070-probe.ts → subagents-071-probe.ts + 头注改写（0.71.0 live probe、票 111 起点 + 1.8.1 升位、三行为注记：dev 动态激活 loader 先行【Q6=A】/打包 worker 默认 fresh/async-started task-goal 脱敏；另修正旧头注 two→three 腿陈旧计数）；②package.json 脚本 smoke:subagents071（outfile probe071.mjs）；③subagent-bridge.ts:58 注释路径同步（bridge 零功能改动）；④补断言：cost capability v1（probe:231-234）、steps[] 两级 census + externalProcess presence-tolerant（:180-190/:472-477）、cost RPC 版本化信封（:245-256，形状先对实装 0.71.0 rpc.js/subagent-cost.js 核对）；⑤tmp 前缀 ×3 + observer/requestId/PICODE071OK 全量 071；⑥index.ts:815-818 与 subagent-sdk-alignment.ts:14-17 各补一句（0.71.0 已删硬导入 #2377，地板常量维持 0.86.1/0.70.0）。产品面三文件纯注释零功能改动；package-lock npm churn 已还原不入 diff。
- 2026-09-24（env-hygiene 块，超票面文字一处、票面验收必要实现）：probe 开头（:108-120）剥 PI_SUBAGENT_CHILD/PI_SUBAGENTS_HERDR_BRIDGE/PI_SUBAGENT_PARENT_SESSION + 清 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT/PI_PACKAGE_DIR。根因：活跑首败 rpc ping 15s 超时——0.71.0 registerSubagentExtension 首行见 PI_SUBAGENT_CHILD=1 即早退零注册（extension/index.js:371-374 实读）；operator-override-wins 使继承值压过 ensureSubagentRunnerPackageRoot 把 runner 配对偏到 nvm 全局 pi 而非捆绑 0.87.1。沿 t142 hostForkEnv / run-all.sh / 票 144 forkHost 先例。双轴评审均裁量通过（spec：必要实现非越权；standards：根因链准确风格一致）。
- 2026-09-24（verification）：smoke:subagents071 活跑 PASS exit 0（用户级 0.71.0 × 捆绑 0.87.1 配对实读；cost_envelope version=1 五键全；三腿 complete→completed / stop→cancelled / child-stop→failed（artifact authoritative 诚实投影）；PROBE PASS + SMOKE_EXIT=0）；活树 grep subagents070|subagents-070|probe070 = 0 命中；vitest 125 文件/2193 全绿（env -u 三变量）；typecheck ×2 exit 0；eslint touched 4 文件 0 findings；smoke 错峰锁 03:40:38 拿→放规矩。证据全录 work-notes/147.md。
- 2026-09-24（dual-axis review）：standards **approve**（0 must-fix / 3 nit：N1 = PI_SUBAGENTS_PARENT_SESSION delete 未被注释覆盖；N2 = src/main/smoke.ts:509 第三处兄弟注释仍写 0.70.1 字样【地板数值仍正确，可选后续】；N3 = 标记剥离 idiom 第三份，repo override 不作违反，第四份出现时可抽 helper）；spec **pass**（0 must-fix：六项逐条落地；env-hygiene 判定必要实现非越权，评审员实装源码独立验证；package-lock churn 确认还原）。遗留候选（归操作者）：smoke.ts:509 兄弟注释刷新微票。
