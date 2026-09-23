# PiCode 1.8.1 — 依赖升级批：SDK 0.87.1 × pi-subagents 0.71.0 × pi-mcp-adapter 2.37.0

Status: ready-for-agent

本 spec 覆盖工单 **144（1.8 批携带微票）+ 146–148**（编号全局连续；145 已消耗）。取证 = 三路 delegate 只读调研（npm pack 解包 diff + changelog 逐字摘录 + .d.ts diff + tsc 编译探针 + PiCode 消费面逐项核对，报告全存 `.scratch/picode-1-8-1/research/`）+ 操作者裁决链（R0 转向 + Round 1 Q1–Q5 + Round 2 Q6–Q10 + Q7 细化轮，全录 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。本批**零 shared-contract 增量**（无 IPC 改动）、无新术语、无 ADR 变更、无多模态票、无参照帧。

## Problem Statement

三件上游包领先于 PiCode 现用版：

| 包 | 现用 | 最新 | 加载面 |
|---|---|---|---|
| `@earendil-works/pi-coding-agent`（锁版捆绑，ADR-0005） | 0.86.1 | 0.87.1 | package.json 锁版嵌入 |
| `pi-subagents`（用户级） | 0.70.1 | 0.71.0 | host extension pipeline 运行时加载 |
| `pi-mcp-adapter`（用户级） | 2.35.0 | 2.37.0 | 同上 |

三路调研一致定论：**三件直接升级均无死亡面**——SDK 唯一硬失败是版本字面量测试断言（`tests/main/bundled-sdk-versions.test.ts:29-30`）；pi-subagents 0.71.0 对 PiCode 强制适配为零（票 134 根因的 transcript-tools 硬导入已在上游删除，changelog #2377）；adapter 2.37.0 契约面（状态快照 v1 / 频道 / 合并规则 / OAuth 流 / skills）字节未变。升级次序无死锁（0.71.0 peer 地板恰为 pi-ai ≥0.86.1；adapter peer 含 ^0.86 与 ^0.87）。

## Solution（R0–R3，每条 1:1 映射工单）

1. **R0（T144，既有票携带）forkHost env-strip**：`scripts/smoke/host-contract-smoke.mjs` 的 forkHost() 剥离 `PI_SUBAGENT_CHILD`/`PI_SUBAGENTS_HERDR_BRIDGE`——subagent 会话驱动 smoke:host 的环境地雷（票 143 实现工实证）。纯 harness 微票。
2. **R1（T146）SDK 0.87.1 bump**：package.json 锁版 0.86.1→0.87.1 + bundled-sdk-versions 测试字面量/注释 + package.mjs 注释；npm install 同步全家桶（chord/pi-agent-core/pi-ai/pi-tui 0.87.1）；全量验证（vitest + smoke 六阶段含 interop 双向；package:verify 收尾门）。会话格式 v3 不变（context_edit 纯加法、仅错误重试/溢出恢复写入；Q2 全局 TUI 同步升后零分歧）。五条 0.87.0 Breaking 全部不触及 PiCode（tsc 双探针 exit 0 / rg 零命中 / 松类型兜底）。
3. **R2（T147）pi-subagents 0.71 探针升位**：subagents-070-probe → subagents-071-probe（git mv + package.json 脚本更名 + bridge 注释路径同步）+ 补 0.71 增量断言（ping.capabilities.cost={version:1}、status.json steps[].externalProcess census、cost RPC 版本化信封）+ 活跑验证（用户级 0.71.0 × 捆绑 0.87.1）。Q6=A：dev 形态动态激活接受现状零改动（打包 app 保持 eager）；worker fresh 默认 / task-goal 脱敏为文档注记。
4. **R3（T148）pi-mcp-adapter 2.37 fidelity**：两处 fidelity 注释 2.35.0→2.37.0 + 重验注记；jev 共存单测（Q7-④：层文档带 settings.jev 时合并忽略、编辑写保留——扩展 tests/shared/mcp-management.test.ts 既有 settings 用例）；MCP smoke 段在 2.37.0 × 0.87.1 下全绿。

## 环境前置（intake 交付执行 prompt 后完成；执行会话只核对不操作）

- `pi update`（self → 0.87.1）+ `pi update --extensions`（pi-subagents → 0.71.0、pi-mcp-adapter → 2.37.0）
- 核对：`pi --version`；用户级两包 package.json version

## 验收口径（批次级）

1. vitest 全绿（env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE 前置，worker 会话纪律）；
2. `npm run smoke` 全套六阶段 PASS（真实模型调用，dev-app serialization）；
3. `npm run package:verify`：PACKAGED ARTIFACT VERIFIED（产物 SDK=0.87.1 核验内置）；
4. ADR-0005 零漂移终态：捆绑 SDK = 全局 TUI = 0.87.1（interop 双向绿）；
5. 每票票面 Acceptance 全勾 + 双轴评审过 + `scripts/merge-ticket.sh NNN` 合并入 main；
6. Linear 镜像全同步（LIA-205=144；146/147/148 各一，Todo 起步随状态流转）；
7. 收尾报告含每票 sha/评审方式/验收结论/遗留风险 + 任务陈述 + 截图项（本批纯依赖/桥/探针面，无 UI 可截图——如实标注）。

## 不做面（本批明确出界）

- **四项可选项全部留盘点**（Q7 终裁）：cost RPC 桥接事件（用量页已计入 subagent 花销，live 消费是独立产品需求）、child-status "started" 转发、exposeResources 全局默认投影、/mcp jev setup UI——候选票归操作者；
- 旧版双态兼容（Q4 单态裁决）；
- SDK 0.87 新能力跟进（context_edit/boundary 事件、buildSessionProjection、context_with_system、per-model image resize——research B#5，另开票）；
- 无 UI 视觉变化 → 无参照帧、无多模态票、visual 抽帧不适用。
