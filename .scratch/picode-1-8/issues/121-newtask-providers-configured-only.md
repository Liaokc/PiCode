# 121: New Task provider 列表统一——仅已配置（会话内口径）

**What to build:** New Task 空态的 provider/model 菜单 provider 列表收紧为**仅已配置 provider**（会话内口径）——`App.tsx` 的 `newTaskProviders` 从 `sortProvidersConfiguredFirst`（配置优先 + 未配置殿后，票 76）改为**过滤掉未配置**（复用既有 `configuredIds`）；会话内路径（contract `models_available`）零改动；空列表降级 = 既有 `modelMenuHint` 诚实文案链（Scanning / No models configured…）不回归。

**背景（取证）：** 操作者图4 vs 图5：New Task 的 provider 列 = auth-probe **全目录**（bella × 3 + Amazon Bedrock / Ant Ling / Anthropic / Azure OpenAI / Baseten / Cerebras / Cloudflare AI Gateway 等未配置项），会话内 = `host/index.ts:446` `modelsAvailable()` = `modelRuntime.getAvailableSnapshot()`（仅已配置 3 项）。两面对同一目录给出不同清单。Q 裁决（操作者原话「都按照有对话的会话来」）：New Task 按会话内口径——仅配置项。

**Blocked by:** 无（独立；122 同区段在其后）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：New Task provider 列表 = 会话内列表（同一 provider 集；操作者机器形态 = bella 家族 3 项，无 Amazon Bedrock 等）
- [ ] 空配置/扫描中/探测失败的 modelMenuHint 三态文案不回归（票 41 语义）
- [ ] 票 76 的 Models 设置节（配置优先排序、全列表）不回归——本票只动 composer 菜单数据源
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P4 定稿为 R3。根因 file:line：`App.tsx:1664-1676` newTaskCatalog 全目录 vs host available 快照。票 76 的「配置优先排序」初衷是设置节与菜单共用规则——本票把 composer 菜单面从该规则解绑（设置节维持全列表），票内需在 Comments 报备该边界。
