# PiCode 1.8.2 — 依赖适配批：pi-mcp-adapter 2.37.0 → 2.38.0

Status: ready-for-agent

本 spec 覆盖工单 **149**（编号全局连续；149 起，无携带票）。取证 = delegate 只读调研（npm pack 2.38.0 解包 /tmp/mcp238 对照用户级实装 2.37.0；changelog 逐字 + 面 diff + PiCode 消费面逐项判定 + 初判线索逐条实证，报告 `.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md`）+ 操作者裁决链（Round 1 Q1–Q4 + Round 2 定稿轮「全部按照推荐来」）。术语遵循 `CONTEXT.md`。本批**零 shared-contract 增量**（无 IPC 改动）、无新术语、无 ADR 变更、无多模态票、无参照帧。

## Problem Statement

用户级 `pi-mcp-adapter` 落后 npm 最新一版：2.37.0 → **2.38.0**（2026-09-26 发布）。pi-subagents 0.71.0 与捆绑 SDK 0.87.1（ADR-0005 锁版）均不动——**本批 = adapter 单件适配**（Q1 裁决）。

调研定论（报告 §3/§5/§7）：**直接升级无硬死面、无新增软降级**——快照 version 1 + 频道 `pi-mcp-adapter/status/v1` 未 bump 未变名；mergeConfigs/mergeServerMaps/两个写器/applySettingDefaults/writeJevSemanticSearchConfig 逐行未变；/mcp 子命令表、/mcp-auth 注册、allowInstall 门未变；peer `^0.84.1||^0.85||^0.86||^0.87` 逐字相同（SDK 0.87.1 在范围内）；README:76 "write targets … unchanged" 引语逐字在案；PiCode 九个消费面（合并模型/状态投影/OAuth 桥/状态桥/服务写器/McpSection/smoke MCP 段/host-contract Round G/I/jev 共存测试）全部零改动成立；Seam-1 守则原样成立（PiCode 零 adapter import）。1.8.1 在案的 `settings.exposeResources` 显示保真缺口原样存续、无恶化（Q2 留盘点维持；与 2.38 零新交互）。

两条非降级注意点（升级后由 smoke 实测覆盖）：含 `~` 的 stdio command 缓存指纹一次性失效（adapter 内部）；`@napi-rs/keyring` ^1.3.0→^2.1.0 原生模块 major bump（用法/keychain 服务名未变，OAuth 双腿 smoke 实测）。

## Solution（R1，1:1 映射工单 149）

**R1（T149）adapter 2.38 fidelity + stdio `~/` 提示**：
1. 两处 fidelity 注释 2.37.0 → 2.38.0 + 重验注记（`src/shared/mcp-management.ts:9`、`src/shared/mcp-status.ts:10`；注记引用调研报告证据——mcp-management 侧：合并规则/写器逐行未变、OpenCode v2 导入归一化与 ancestorConfigRoots 放宽属 adapter host-import 面永不镜像、stdio `~/` 展开为运行时 spawn 行为文件层不展开故显示保真成立；mcp-status 侧：mcp-status.ts 字节相同、version 1 与频道未 bump、search 转正与 keep-alive 修复不触碰快照形状）。
2. McpSection 加/编辑对话框 stdio 分支加一行 `~/` 支持提示（复用既有 `settings-mcp-form-note` 类，零新 CSS；UI 文案全英文）——透出 2.38 唯一值得透出的新能力（调研 §8-C：`~/` 在 command/args/cwd 运行时展开，PiCode 模型零改动即生效）。
3. MCP smoke 段在用户级 2.38.0 下复核全绿（host-contract Round G/I + electron smoke MCP 段含 OAuth 双腿——OAuth 双腿同时实测 keyring major bump 后的 macOS keychain 行为）。

## 环境前置（intake 交付执行 prompt 后执行；执行会话只核对不操作）

- intake 执行：`pi update --extensions`（pi-mcp-adapter → 2.38.0）+ 版本验证 + 报告（Q3 裁决，沿 1.8.1 先例）
- 执行会话开目核对：`pi --version` = 0.87.1；用户级 pi-subagents = 0.71.0、pi-mcp-adapter = 2.38.0；`git worktree list` 仅根

## 验收口径（批次级）

1. vitest 全绿（`env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 前置，worker 会话纪律）；
2. `npm run smoke:host` 全套 PASS（含 Round G/I）；`npm run smoke:electron` 全套 PASS（MCP 段 16 断言全绿，含 OAuth 自动腿 + 手动粘贴腿）——dev-app serialization 纪律；
3. `npm run smoke` 全套 + `npm run package:verify`（批次收尾门，main 串行安静环境）；
4. 票面 Acceptance 全勾 + 双轴评审过 + `scripts/merge-ticket.sh 149` 合并入 main；
5. Linear 镜像全同步（149 一票，Todo 起步随状态流转）；
6. 收尾报告含每票 sha/评审方式/验收结论/遗留风险 + **任务陈述 + 截图项**（T149 含 UI 可见改动：加/编辑对话框 `~/` 提示行——执行会话手截对话框帧入 `.scratch/picode-1-8-2/reference/` 并报告绝对路径；对话框不在 visual:settings harness 覆盖内）。

## 不做面（本批明确出界）

- 1.8.1 四项遗留候选（cost RPC 桥接 / child-status "started" 转发 / exposeResources 全局默认投影 / `/mcp jev setup` UI）+ SDK 0.87 新能力跟进——全部留盘点（Q2 裁决；调研 §6 确认与 2.38 零新交互，不重新摆桌）；
- 其余 2.38 新能力（search 转正 / keep-alive 修复 / OpenCode v2 导入 / mcpScript 统计 / orca viewer / keyring 复用 / Ajv format / ancestorConfigRoots / OAUTH.md）——均无 PiCode 消费面，不透出（调研 §8-C）；
- 旧版双态兼容（单态以新版为主，沿 1.8.1 Q4 先例）；
- 无 shared-contract 增量、无新参照帧、无多模态票（`~/` 提示为纯文本行，票面给精确文案，无需看图）。
