# 121: New Task provider 列表统一——仅已配置（会话内口径）

**What to build:** New Task 空态的 provider/model 菜单 provider 列表收紧为**仅已配置 provider**（会话内口径）——`App.tsx` 的 `newTaskProviders` 从 `sortProvidersConfiguredFirst`（配置优先 + 未配置殿后，票 76）改为**过滤掉未配置**（复用既有 `configuredIds`）；会话内路径（contract `models_available`）零改动；空列表降级 = 既有 `modelMenuHint` 诚实文案链（Scanning / No models configured…）不回归。

**背景（取证）：** 操作者图4 vs 图5：New Task 的 provider 列 = auth-probe **全目录**（bella × 3 + Amazon Bedrock / Ant Ling / Anthropic / Azure OpenAI / Baseten / Cerebras / Cloudflare AI Gateway 等未配置项），会话内 = `host/index.ts:446` `modelsAvailable()` = `modelRuntime.getAvailableSnapshot()`（仅已配置 3 项）。两面对同一目录给出不同清单。Q 裁决（操作者原话「都按照有对话的会话来」）：New Task 按会话内口径——仅配置项。

**Blocked by:** 无（独立；122 同区段在其后）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：New Task provider 列表 = 会话内列表（同一 provider 集；操作者机器形态 = bella 家族 3 项，无 Amazon Bedrock 等）
- [x] 空配置/扫描中/探测失败的 modelMenuHint 三态文案不回归（票 41 语义）
- [x] 票 76 的 Models 设置节（配置优先排序、全列表）不回归——本票只动 composer 菜单数据源
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）——vitest 全套 1976/1977，唯一 fail 为预存在环境项（见 Comments）

## Comments

- 2026-09-22 (requirements intake)：P4 定稿为 R3。根因 file:line：`App.tsx:1664-1676` newTaskCatalog 全目录 vs host available 快照。票 76 的「配置优先排序」初衷是设置节与菜单共用规则——本票把 composer 菜单面从该规则解绑（设置节维持全列表），票内需在 Comments 报备该边界。
- 2026-09-22 (implement session，t121-providers-configured @ d3dd39b，based on 50ba1b4)：**边界报备**：票 76 的「配置优先 + 全列表」规则仅剩设置窗 Models 节与活会话菜单两处消费；New Task composer 菜单面解绑为「仅已配置」。实现 = ①`src/shared/provider-sort.ts` 新 Seam-1 纯函数 `configuredProvidersOnly`（过滤到已配置集 + 组内字母序复用 `byDisplayName`——与活会话路径 `chatForView` sort 后的列完全同序，两面同集同序；configured=null（缺/空报告）降级原序，与 sort 同诚实律；不改输入、模型列随组引用）；②`App.tsx` `newTaskProviders` 换接；`newTaskModelMenuHint` 第三态从「catalog.providers 空」改为「newTaskProviders 空」（旧触发集 ⊆ 新触发集：目录空 ⇒ 过滤后空；新增覆盖 = 目录非空但全部未配置 → 照显 No models configured — sign in from the Pi TUI…；Scanning / unavailable 两态不动且优先）；③会话内路径零改动（host `modelsAvailable()` / `chatForView` / ModelsSection 均零 diff）。验证：vitest provider-sort 18/18（新增 7 例）；typecheck 清；eslint 4 文件零告警；electron smoke A/B 同机对照——base 50ba1b4 = `empty_state_menu_provider_order_ok` 44 项全目录，本实现 = `bella,bella-local,bella-remote`（仅已配置，无 Amazon Bedrock 等）+ `menu_keyboard_model_providers_ok providers=3`（会话内同集）+ `settings_models_provider_order_ok` 全列表配置优先不回归。另新增会话内 parity 直接断言（`menu_keyboard_model_parity_ok`，in-session 列 == 同份报告派生的 configured-only 期望）——加入于末次全量 smoke 之后，待下次 smoke 运行实证（低风险：同 DOM 探针模式 + 两侧同名同源）。遗留（非本票）：①`tests/main/subagent-runner-root.test.ts` 在本机失败（stash 裸分支同败——本机 SDK 装在 nvm 全局路径，解析器返回全局路径），环境性预存在；②electron smoke ticket-90 段（live run badge 翻转）确定性失败，已在 base 50ba1b4 裸分支复现同样失败（A/B 证实预存在；假设 = pi-subagents fleet RPC 回复失败 → `available:false` → `foldSubagentStatus` 整体忽略快照，subagent-bridge.ts:148 + session-registry.ts:241），需独立立票调查。审查：self-review 双轴（Standards：零新缝/零契约增量/命名一致/无 TODO；Spec：四项验收逐条对照如上）。
