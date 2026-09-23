# 147: pi-subagents 0.71 探针升位——070→071 更名 + 0.71 增量断言 + 活跑验证

**Status:** ready-for-agent

**What to build:** Q8 裁决（更名 + 补断言）。调研定论（`.scratch/picode-1-8-1/research/pi-subagents-0.71.0-diff.md`）：0.71.0 对 PiCode 强制适配为零；既有探针断言在 0.71.0 全过（纯形状断言无版本钉）。本票把票 111 的 0.70 活探针升位为 0.71：

1. `git mv scripts/smoke/subagents-070-probe.ts scripts/smoke/subagents-071-probe.ts`；头部注释改写（0.70.1 → 0.71.0 live probe；票 111 起点 + 1.8.1 升位；记录三个 0.71 行为注记：dev/unpacked 动态激活 loader 先行【Q6=A 接受现状】、打包 worker 默认 fresh 上下文、async-started task/goal 脱敏——探针的 RPC 与直达命令路径均不受激活门影响，调研 §3④ 实证）；
2. `package.json` 脚本：`smoke:subagents070` → `smoke:subagents071`（esbuild outfile probe070.mjs → probe071.mjs）；
3. `src/host/subagent-bridge.ts:58` 注释里的探针路径同步改为 subagents-071-probe.ts（仅注释，bridge 零功能改动）；
4. 补 0.71 增量断言：①`ping.capabilities.cost` 广告 `{version:1}`；②status.json 字段 census 增 `steps[].externalProcess`（presence-tolerant：在场记录、缺席不失败）；③可选加一次 cost RPC 调用并校验版本化信封（version=1 + parent/children/childTotal/total/unresolvedAsyncChildren 键在场、数值型宽松）；
5. 内部 tmp 前缀 probe070 → probe071（:79-84、:110 一带）；
6. 注释刷新（轻量）：`src/main/index.ts:813` 票 134 注释与 `src/shared/subagent-sdk-alignment.ts` 头注各补一句——0.71.0 已删除 transcript-tools 硬导入（上游 #2377），地板常量维持 0.86.1/0.70.0 不变（守 0.70.x 旧装，语义仍准确）。

## Acceptance

- [ ] `npm run smoke:subagents071` PASS exit 0（活跑：用户级 pi-subagents 0.71.0 × 捆绑 SDK 0.87.1）
- [ ] cost capability 断言 + externalProcess census 在位
- [ ] 全仓无 subagents070 / subagents-070 / probe070 残留引用（grep 干净，含 package.json/注释）
- [ ] vitest 全绿（env -u 纪律）+ typecheck/eslint touched 绿

**Background（取证）:** RPC 七方法 handler（status/spawn/steer/interrupt/stop/resume）逐字节不变（rpc.js diff 仅新增 cost）；status.json 信封不变（steps 仅增量可选 externalProcess：async-status.js 一行展开）；四生命周期事件名/payload 键不变（child-status 增 "started" 被现有 forwardChildStatus 过滤器忽略——Q7-② 裁决留盘点）；fleet DTO 构造器逐字节相同；steer/stop 应答形状原样。票 134 根因的 review.js/permission-arbiter.js pi-ai 硬导入在 0.71.0 整体删除（watchdog 改 initialState.systemPrompt，pi-agent-core 0.86.1 原生支持）。证据索引见报告附录。

**Red lines:** 不 push/不打 tag/不 release；无产品/shared 功能改动（bridge 仅注释）；不碰 ~/.pi 环境。

**Blocked by:** 146（package.json 重叠 + 探针活跑依赖捆绑 SDK 0.87.1）。
