# PiCode 1.8.2 — Intake Grilling（需求沟通 × 轮次 × 裁决账）

> 本文件是 v1.8.2 批次的需求沟通全记录：痛点 × 轮次 + 裁决 + 根因证据 + 复核记录。裁决链只增不改，改判留痕。
> 术语遵循 `CONTEXT.md`；契约见 `docs/agents/development-contract.md`。

## 批次上下文

- 前批 v1.8.1 已发版收口：tag `v1.8.1` = 14b5c88（已推 origin）、main = 8a2a27b、/Applications/PiCode.app = 1.8.1、Linear 零在办（run-log EV-0030/0031）。
- 环境水位（2026-09-26 核对）：pi self 0.87.1 · pi-subagents 0.71.0（不动）· **pi-mcp-adapter 2.37.0 → npm 最新 2.38.0**（2026-09-26 发布）。
- 调研基线：`.scratch/picode-1-8-1/research/pi-mcp-adapter-2.37.0-diff.md`（T148 据此交付；fidelity 注释现为 2.37.0）。
- 工单号水位：**149 起**（144/146/147/148 已由 1.8.1 消耗；全局连续不跳号不重号）。
- 批次目录 `.scratch/picode-1-8-2/` 已建（intake 唯一写面）。
- merge-gate `scripts/merge-ticket.sh:50` 现列 picode-1-0…1-8-1——需补 picode-1-8-2（执行会话开目第一步；intake 不改 scripts/，红线）。

## 第零步核对记录（2026-09-26，intake 实证）

| 项 | 证据 |
|---|---|
| git tag | v1.8.1 = 14b5c88；`git log --oneline -10` main = 8a2a27b（1.8.1 Linear wrap-up） |
| package.json | version 1.8.1；`"@earendil-works/pi-coding-agent": "0.87.1"`（:72，锁版） |
| git worktree list | 仅根 ✓ |
| /Applications/PiCode.app | CFBundleShortVersionString = 1.8.1 ✓ |
| 用户级包 | pi-subagents 0.71.0 · pi-mcp-adapter 2.37.0（~/.pi/agent/npm/node_modules/*/package.json 实读） |
| npm 最新 | pi-mcp-adapter 2.38.0（npm view；发布 2026-09-26T14:23:35Z） |
| PiCode 消费面 | mcp-management.ts fidelity @ :9（2.37.0）；mcp-status.ts @ :10（同）；auth/status 桥、McpSection、smoke MCP 段（src/main/smoke.ts ~12892 起）、host-contract Round G/I 均在位（详见 research 报告 §3） |
| 外部 host 工具面 | PiCode 只读兼容发现（Cursor/Claude 等），绝不写；`~/.agents` 胜出只读拒写（mcp-management.ts:328-330, 395-401）；**PiCode 当前不消费 OpenCode 配置** |

## Round 1 — 开工四问（Q1–Q4，操作者裁决 2026-09-26）

- **Q1 · 批次范围 = adapter 2.38.0 单件**（操作者：是的）。本批 = pi-mcp-adapter 2.37.0 → 2.38.0 适配；pi-subagents 0.71.0 与 SDK 0.87.1 均不动。
- **Q2 · 遗留盘点项全部不动**（操作者：可以）。1.8.1 四项候选（cost RPC 桥接 / child-status "started" 转发 / exposeResources 全局默认投影 / `/mcp jev setup` UI）+ SDK 0.87 新能力跟进——留盘点、不入批；若 2.38.0 调研发现与某项有交互，单独摆桌重新裁决（届时入账）。
- **Q3 · 环境升级时序沿 1.8.1 先例**（操作者裁决）：intake 交付执行 prompt 后由 intake 代操作者执行 `pi update --extensions`（pi-mcp-adapter → 2.38.0）+ 版本验证 + 报告；执行会话只核对不操作环境。
- **Q4 · 模型分派（操作者原话，照抄）**：文本模型使用 bella-local/GLM-5.3，多模态模型使用 bella/GLM-5.3-flash，思考强度都使用 max。

## Round 2 — 调研 delegate 证据轮（2026-09-26，报告 `.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md`）

- delegate 已派（async）并完成：2.37.0 → 2.38.0 npm pack 解包 /tmp/mcp238 全量 diff + changelog 逐字 + PiCode 消费面逐项判定 + 初判线索实证 + 1.8.1 遗留项交互检查。仓库与 ~/.pi 零写入。
- **硬死面：无**。全部契约面在 2.38.0 原样成立：快照 version 1 + 频道 `pi-mcp-adapter/status/v1` 未 bump/未变名；mergeConfigs/mergeServerMaps/两个写器/applySettingDefaults/writeJevSemanticSearchConfig 逐行未变；/mcp 子命令表、/mcp-auth 注册、allowInstall 门未变；peer `^0.84.1||^0.85||^0.86||^0.87` 逐字相同（SDK 0.87.1 在范围内）；README:76 "write targets … unchanged" 逐字在案（报告 §3 契约面核对表）。
- **软降级：无新增**。exposeResources 显示保真缺口（1.8.1 在案）原样存续、无恶化——**与 2.38 无新交互，Q2 裁决（留盘点）维持，不重新摆桌**。两条非降级注意点：①含 `~` 的 stdio command 缓存指纹升级后一次性失效（adapter 内部）；②`@napi-rs/keyring` ^1.3.0→^2.1.0 原生模块 major bump（用法/keychain 服务名未变；升级后 OAuth 双腿 smoke 实测覆盖）。
- **适配清单**：S×1——两处 fidelity 注释 2.37.0→2.38.0（mcp-management.ts:9、mcp-status.ts:10）+ 重验注记；其余消费面（mcp-status/auth-bridge/status-bridge/mcp-service 写器/McpSection/smoke 断言/host-contract Round G/I/jev 共存测试）全部零改动（报告 §5 逐项 file:line）。Seam-1 复核：PiCode 零 adapter import，原样成立。
- **新能力盘点**（报告 §8-C）：stdio `~/` 展开（运行时 spawn 展开、文件层不展开——PiCode 显示保真成立，无需模型跟进；表单帮助文案可透出，S）；search 转正/keep-alive 修复/OpenCode v2/mcpScript 统计/orca viewer/keyring 复用——均无 PiCode 消费面。
- **遗留项交互检查**（报告 §6）：exposeResources = 无新交互；jev setup UI = 无交互；cost RPC/child-status（pi-subagents 面）= 2.38 变更集零 subagent 文件，零交互。

### Round 2 裁决（待操作者）

- （回填位：定稿轮裁决——T149 范围确认 + stdio `~/` 帮助文案归属）
