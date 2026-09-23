# PiCode 1.8.1 需求收集记录（requirements intake，v1.8.0 后批次）

Status: in-progress

2026-09-24 需求收集会话产出。操作者逐轮报痛点（P1、P2… 编号连续）；每条先在 main 源码实证根因（file:line）再下结论——不臆测；已发版行为与期望不符时先判「缺陷 vs 行为修订」再归类。术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 只读、UI 文案全英文）。工单编号 **146 起全局连续**（145 已由 1.8 批收尾票消耗，不跳号不重号）。

## 批次上下文

- 基线（2026-09-24 本会话开场核对）：main HEAD `7fb24ba`（开发契约提交）；tag `v1.8.0` = 发布树 `98d2142`（main + tags 已推 origin = github.com:Liaokc/PiCode）；package.json `1.8.0`；/Applications/PiCode.app = 1.8.0（旧版备份 1.7.0/1.6.0 在）；`git worktree list` = 仅根（工区已清空）。
- 本批 = **picode-1-8-1**，spec/工单目录 `.scratch/picode-1-8-1/`（开场已创建，含 `reference/`）——intake 会话唯一写面，绝不改 `src/` `scripts/`，不合并不 push 不打 tag。
- merge-gate `scripts/merge-ticket.sh:50` 现列 picode-1-0…1-8——开目时需补 picode-1-8-1（默认操作者执行，授权后 intake 可代补，沿 2026-09-16 先例）。
- Linear 镜像工具链开工自检：`mcp_save_issue` / `mcp_list_issues` 在位可用，无需 auth 流程。
- Linear 工作区备案（非本批处理面，仅留痕）：①票 144 实际 mirror id = **LIA-205**（1.8 run-log 曾记 LIA-154，以 workspace 实际为准）；②票 143 存在重复行 LIA-204 与 LIA-206（Done，内容同）——上一批镜像遗留，是否合并/清理由操作者后续裁决。
- 遗留待裁决（已报操作者）：根目录未跟踪文件 `.scratch/picode-1-7-intake-prompt.md`（非本会话产物）——入库/删除待操作者顺手裁决。

## R0 迭代转向：依赖升级批（操作者指令，2026-09-24，grill-with-docs 启动）

- **操作者指令**：本批转小迭代——pi agent / pi-subagents / pi-mcp-adapter 三件已发新版领先于 PiCode 现用版；目标 = 更新 + PiCode 适配；先 spawn subagent 调研三件与现用版本的差异、直接更新是否致崩、更新后如何适配；经 grill-with-docs 与操作者敲定本批各类问题后开发。
- **版本水位（本会话 npm view 实证，2026-09-24）**：
  - SDK `@earendil-works/pi-coding-agent`：锁版 0.86.1（package.json:72，node_modules 实装 0.86.1）；npm 最新 **0.87.1**；全局 TUI pi 亦 0.86.1（ADR-0005 零漂移现状）。
  - `pi-subagents`：用户级 `~/.pi/agent/npm/node_modules` 0.70.1（settings.json packages: npm:pi-subagents，host extension pipeline 运行时加载）；npm 最新 **0.71.0**。
  - `pi-mcp-adapter`：用户级 2.35.0（同 settings.json packages）；npm 最新 **2.37.0**。
- **适配面盘点（源码实证）**：`src/shared/subagent-sdk-alignment.ts:17-18`（地板常量 SDK 0.86.1 / 包 0.70.0）；`src/host/subagent-bridge.ts`（票 90/99/101 RPC/steer/stop）+ `subagent-runner-root.ts`；`src/shared/subagents/`（七态目录/chat 模型/工件）；`src/shared/mcp-management.ts` + `mcp-status.ts`（票 115 标注 2.35.0 保真；票 96 版本化状态快照事件）；`src/host/mcp-auth-bridge.ts` + `mcp-status-bridge.ts`；`scripts/smoke/subagents-070-probe.ts`（0.70.1 活探针）；`scripts/package.mjs:69-91`（0.86.1 打包校验）；`src/main/smoke.ts:509/551`（t134 地板断言）；`src/main/index.ts:813`。
- **调研派工（操作者明示授权 spawn）**：三路 delegate 并行异步（workflow b0356b88）——SDK 0.87.1 diff / pi-subagents 0.71.0 diff / pi-mcp-adapter 2.37.0 diff；报告落 `.scratch/picode-1-8-1/research/`；delegate 只读取证（/tmp 解包 diff，仓库与 ~/.pi 零写入）。
- **grilling Round 1（Q1–Q5）已摆给操作者**：三件齐升 vs 分步 / 全局 TUI 同步 / 适配深度（不破坏 vs 采纳新能力）/ 旧版兼容单态 vs 双态 / 断言探针面入票。答后回填。

## Q0（开工第一问）：微票 144 处置 —— **A：并入 1.8.1**

- **问题**：微票 144（forkHost 环境标记剥离——`scripts/smoke/host-contract-smoke.mjs:408-415` 直 fork host 时不剥 `PI_SUBAGENT_CHILD`/`PI_SUBAGENTS_HERDR_BRIDGE`；从 subagent 会话驱动的 smoke:host 死 Round K，票 143 实现工实证、`env -u` 三变量后全套过；Linear LIA-205 Todo）仍待派。
- **裁决（操作者 2026-09-24，答「A」）**：**并入 1.8.1 批次**——harness 微票入 1.8.1 波次表（纯 scripts/smoke 面改动，不阻塞任何票），编号沿用 144 不新开；票文件留原地 `.scratch/picode-1-8/issues/144-forkhost-env-strip.md`（merge-gate 已覆盖 picode-1-8 目录，零移票必要）。
- **镜像记录**：LIA-205 描述追加变更记录 + `addLabels: iter:1.8.1`（iter:1.8 保留为立项来源标记）；状态维持 Todo 待波次派工。
- **落库**：票面新增 `## Comments` 裁决记录；本文件 Q0 节即全量账。
