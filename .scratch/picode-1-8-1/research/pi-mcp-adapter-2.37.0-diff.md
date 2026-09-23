# 调研报告：pi-mcp-adapter 2.35.0 → 2.37.0 升级差异与 PiCode 适配面

- 日期：2026-09-24（调研会话）
- 工作目录：`/Users/liaokechen/PiCode`；解包/diff 全在 `/tmp/mcp237`（`npm pack pi-mcp-adapter@2.37.0` → `tar -xzf`，得到 `package/` 即 2.37.0 干净源）
- 基线：`~/.pi/agent/npm/node_modules/pi-mcp-adapter`（2.35.0，用户级实装，settings.json `packages: npm:pi-mcp-adapter`）
- 铁律遵守：仓库与 `~/.pi` 全程只读（未跑任何 npm install 到既有位置，未改任何既有文件）；本文件是唯一写入物（`.scratch` 交付目录）。ZCode 无关，未涉及。

## 1. CHANGELOG 逐字摘录（2.35.0 之后全部条目）

来源：`/tmp/mcp237/package/CHANGELOG.md`（2.37.0 tgz 自带）。

### [2.37.0] - 2026-09-23

Highlights:
- Use Jev semantic search with other System One providers, such as OpenCode Zen, Command Code, or OpenRouter, by setting `SYSTEMONE_ENDPOINT`.
- Stop agents from installing new MCP servers with `settings.allowInstall: false`.
- Turn off resource tools for every server with one `settings.exposeResources: false` setting.
- Start Pi without waiting on MCP servers even when cached tool metadata is missing, with `settings.deferWithMissingMetadata`.

Added:
- Jev can send System One requests to any HTTPS provider endpoint set in `SYSTEMONE_ENDPOINT`. TypeSafe stays the default. API keys are stored per endpoint, and an invalid endpoint turns Jev off instead of quietly falling back to TypeSafe. Thanks to [@jagaliano](https://github.com/nicobailon/pi-mcp-adapter/pull/645).
- `settings.deferWithMissingMetadata: true` lets Pi start without connecting to MCP servers even when their cached metadata is missing or out of date. Those servers show no tools until the first MCP call loads them. Thanks to [@j62268781-alt](https://github.com/nicobailon/pi-mcp-adapter/issues/641).
- `settings.allowInstall: false` blocks agents from installing remote MCP servers with `mcp({ action: "install" })`, for headless or locked-down setups. Thanks to [@gastmaier](https://github.com/nicobailon/pi-mcp-adapter/issues/638).
- `settings.exposeResources: false` hides resource tools for every server. A server's own `exposeResources` setting still wins. Thanks to [@rakesh-vs](https://github.com/nicobailon/pi-mcp-adapter/pull/636).

Changed:
- The Jev key command is now `pi-mcp-adapter key set systemone`, and the environment variable is `SYSTEMONE_API_KEY`. The old `key set typesafe` command still works, and `TYPESAFE_API_KEY` still works with the default TypeSafe endpoint.
- Supports Pi 0.87.

Fixed:
- `getMcpOAuthTokensForUrl` no longer returns an expired access token when no refresh token is stored, so other extensions see a signed-out server instead of sending a dead token. Thanks to [@benjaminsirb](https://github.com/nicobailon/pi-mcp-adapter/issues/644).
- Tools in `directTools: "search"` mode now stay inactive until a search selects them, even if another extension turns them back on. Tools a search activates stay on until the session ends. Thanks to [@VoidInTheShell](https://github.com/nicobailon/pi-mcp-adapter/pull/640).

### [2.36.0] - 2026-09-21

Highlights:
- Set up TypeSafe semantic search from Pi with `/mcp jev setup`.
- Search every enabled MCP tool automatically when a TypeSafe key is available.
- Use regex safety checks reliably on Windows with both native and Java backends.
- Get clearer, non-duplicated guidance when tool catalogs are large or semantic search finds no match.

Added:
- `/mcp jev setup` checks for a TypeSafe credential, lets you restrict which MCP servers may share semantic-search data, saves the project policy, and reloads Pi automatically.

Changed:
- A valid TypeSafe key now enables semantic search across every enabled MCP tool by default, while script evaluation remains opt-in. Search now explains when an allowlist permits no servers, when permitted servers have no cached tools, and when none of the available tools match the request.

Fixed:
- Regex safety checks on Windows resolve recheck's native executable and JAR fallback correctly. `recheck` is intentionally pinned to `4.6.0-beta.3` until a stable fixed release is available. Thanks to [@LCubero](https://github.com/nicobailon/pi-mcp-adapter/issues/623), and [@Kristinita](https://github.com/nicobailon/pi-mcp-adapter) and [@makenowjust](https://github.com/makenowjust) for the upstream reproduction and fix.
- Large direct-tool advisories now use Pi's renderer in interactive sessions, avoiding raw console output and duplicate warnings. Thanks to [@grivper](https://github.com/nicobailon/pi-mcp-adapter/issues/633).
- Windows contributors can run `npm test` again; the runner now launches npm through `cross-spawn` so hardened Node versions can execute `npm.cmd`. Thanks @insuffer for the fix.

## 2. 面 diff 结果（2.37.0 vs 实装 2.35.0）

`diff -r`（排除 node_modules）变更文件全集（相对 2.35.0）：
`CHANGELOG.md, README.md, cli.js, commands.ts, config.ts, direct-tool-surface.ts, direct-tools.ts, index.ts, mcp-auth-flow.ts, mcp-code.ts, proxy-modes.ts, semantic-search.ts, types.ts, jev-client.ts, jev-contracts.ts, jev-key-store.ts, package.json` + `dist/{config,jev-client,jev-contracts,jev-key-store,mcp-auth-flow,types}.*`。
**未变（对 PiCode 关键）**：`mcp-status.ts`、`mcp-setup-panel.ts`、`mcp-panel.ts`、`server-manager.ts`、`lifecycle.ts`、`state.ts`、`mcp-callback-server.ts`、`secure-keyring.ts`、`mcp-install.ts`、`onboarding-state.ts`、`claude-plugin-loader.ts`、`agent-plugin-loader.ts`、`utils.ts`、`skills/`（整目录字节相同——`/mcp-scripting` 技能命令不变）。

### 2.1 config.ts —— 合并规则
- 合并本体（`mergeConfigs`、`mergeServerMaps`、URL-bound auth 剥离、transport 切换清场、`writeProjectServerDisabledOverride`、`writeSharedServerEntry`、`/mcp setup` 两个写目标）**逐行未变**。
- 唯一行为新增：合并结果外包一层 `applySettingDefaults`（`package/config.ts:379,382-389`）——`settings.exposeResources` 有定义时，把它作为每个**未自带** `exposeResources` 的 server 的默认值（server 自带者胜出）。
- 新增 `writeJevSemanticSearchConfig`（`package/config.ts:1189+`）——Jev allowlist 写入，PiCode 无消费。

### 2.2 types.ts —— 设置面 + 状态契约
- `MCP_STATUS_SNAPSHOT_VERSION = 1`（`package/types.ts:20`）与 `MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1"`（`package/types.ts:18`）**两版相同，未 bump**。
- `McpSettings` 新增可选字段（全部 additive）：`allowInstall`、`deferWithMissingMetadata`、`exposeResources`；`jev` 语义改为「有效 key 默认启用语义搜索、scriptEvaluation 仍默认关」。

### 2.3 index.ts —— 命令面与生命周期
- `/mcp` 子命令表新增 `jev`（`package/index.ts:1235,1247,1340`）；`/mcp setup`/`enable`/`disable`/`logout`/`token`/`edit` 分发未动。`/mcp-auth` 注册（`index.ts:1453`）未动。
- `mcp({action:"install"})` 新门：`settings.allowInstall === false` → 返回 `install_disabled`（`index.ts:1597-1603`）。
- defer 重构：模块期一次性 `deferSessionRuntime` 改为 session_start 时 `getDeferredSessionSnapshot(ctx.cwd)`（cwd 感知）；`deferWithMissingMetadata !== true` 时无有效缓存不 defer（`index.ts:672,1115`）；prompt 命令注册推迟到 cwd 权威后。
- search-mode 工具持有修复：`session_start` 清 `searchActivatedTools` + `before_agent_start` 时 `holdLazyToolsInactive()`（PR #640）。**`before_agent_start` 在 PiCode 内嵌 SDK 0.86.1 中已存在**（`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts`），订阅不炸、修复在 PiCode 会话内同样生效。
- 大 direct-tools 告警从 console.warn 改为交互会话走 `ctx.ui.notify`（`deliverLargeDirectToolsAdvisory`）。

### 2.4 mcp-auth-flow.ts —— OAuth
- 唯一改动：`getValidToken` 尾部（`package/mcp-auth-flow.ts:1120-1196`）——过期且无 refresh token 时 `return null`（2.35 为 `return entry.tokens`）。即 CHANGELOG 的 `getMcpOAuthTokensForUrl` 修复（oauth.ts:25 以该名再导出）。这是**面向其他扩展的 token 查询 API**；`/mcp-auth` 流本体（浏览器打开、localhost 回调、动态注册、code 兑换、keychain 存储）逐行未变。

### 2.5 其余
- `commands.ts`：仅新增 `setupJevSemanticSearch`（`commands.ts:68+`）。
- `mcp-code.ts`：TypeSafe→Jev 错误文案改名。
- `proxy-modes.ts`：semantic 后端 abstain 时搜索无结果的文案可变（"Jev found no suitable tool…"）。
- `package.json`：peer `@earendil-works/pi-ai` 加 `^0.87.0`（仍含 0.84.1/0.85/0.86）；devDeps 升 0.87；`recheck` 钉 `4.6.0-beta.3`。
- `README.md`：设置表新增 `allowInstall`/`deferWithMissingMetadata`/`exposeResources` 行、per-server 覆盖清单加 `exposeResources`、Jev/System One 段重写。**PiCode 引用的第 76 行（"`/mcp setup` write targets and project-local `/mcp disable` and `/mcp enable` overrides are unchanged"）逐字未变**，层次优先级故事未变。

## 3. PiCode 消费面逐项判定

### ① mcp-management 合并模型（src/shared/mcp-management.ts）
- 层次优先级、per-field 合并、URL-bound auth 剥离、transport 清场、胜出层/definedIn、disabled 旗标写（`deriveDisabledFlagWrite` 镜像 `writeProjectServerDisabledOverride`）、`/mcp setup` 两正规目标、`~/.agents` 拒写、canonical 写面：**全部与 2.37 行为一致**（§2.1 证据）。
- 唯一缺口：`mergeMcpLayers`（`src/shared/mcp-management.ts:272`）不读层文档的 `settings` 块，故用户设置 `settings.exposeResources: false` 时，PiCode 合并视图显示的 effective entry 不带该默认值，而 adapter 运行时已把资源工具全局关掉。**仅显示保真缺口，不涉写路径，且仅当用户启用 2.37 新设置才出现。**

### ② mcp-status 六态映射与快照版本（src/shared/mcp-status.ts）
- **完全兼容**：adapter `mcp-status.ts` 字节未变；`MCP_STATUS_SNAPSHOT_VERSION = 1`、channel `pi-mcp-adapter/status/v1` 均未变（§2.2）。六态 + 第七态诚实降级、tool 计数、bounded 投影（listenState/catalogStale 剥离）全部照旧。
- `deferWithMissingMetadata: true` 时初始快照可能延迟/服务器零工具——`mcpStatusLine` 的「尚未上报」与空快照注记已诚实覆盖，不砸。

### ③ OAuth 桥（src/host/mcp-auth-bridge.ts）
- **兼容**：`hasCommand('mcp-auth')` 守卫的命令注册未变（§2.3）；`/mcp-auth` 通过 `session.prompt` 的命令形状未变；流中 notice/input 转发形状未变；`getValidToken` 修复只影响扩展侧查询 API（PiCode 零 adapter import，Seam-1 守则，mcp-status.ts 头注明确），不经 PiCode 面。

### ④ smoke 断言面
- `src/main/smoke.ts` MCP 段（~12903-13600）：双卡/来源徽章/合并 summary/disable 旗标写/加改删/OAuth 自动腿+手动粘贴腿/ticket-96 状态徽章（Connected/Needs auth/Not connected/2 tools）/零触发红线/外部配置字节不变——全部骑在未变表面上（§2）。mock OAuth 流走 `/mcp-auth` 与回调服务器（未变）；keychain/`MCP_OAUTH_DIR`/`PI_MCP_ADAPTER_DISABLE_AUTH_CACHE` 机制未变。
- `scripts/smoke/host-contract-smoke.mjs`：Round G（ghost server not-found notice → `mcp_auth_completed(ok=false)`）骑未变的 `/mcp-auth` not-found 路径；Round I `assertRoundI`（version 1、bounded 字段、lazy=not-connected、off=disabled）骑未变的 mcp-status.ts——**均不死**。Round I 的 defer 说明（cached-but-empty 才 defer）与 2.37 的 cwd 感知 defer 在该种子场景行为等价（无缓存 → 不 defer → 快照必达）。
- ticket-110 的 `/mcp-scripting` 技能命令：skills/ 目录两版字节相同。
- PiCode 内嵌 SDK 0.86.1（`package.json:72`）在 2.37 peer 范围内（^0.84.1||^0.85||^0.86||^0.87）。

## 4. 结论

### A) 用户级直接升 2.37.0：现行 PiCode 会死/降级哪些面
**无硬死面。** 所有契约面（合并模型、状态投影 v1、OAuth 桥、smoke 断言、IPC 事件）在 2.37.0 下原样成立（§3、§2 证据）。两处**软降级（保真缺口，仅当用户启用新设置）**：
1. `settings.exposeResources: false` 时合并视图不反映全局默认（PiCode `src/shared/mcp-management.ts:272` mergeMcpLayers 不读 settings 块 vs adapter `package/config.ts:379,382-389`）。
2. `settings.deferWithMissingMetadata: true` 时初始状态快照可延迟——诚实降级文案已覆盖，无错误状态。
另：`/mcp jev` 新子命令、`allowInstall` 门、Jev 子系统对 PiCode 完全不可见（无消费面），不构成死/降级。

### B) 适配清单（改动点 / 文件 / 工作量）
| # | 改动 | 文件 | 量级 |
|---|---|---|---|
| 1 | 两处 fidelity 注释 2.35.0 → 2.37.0 + 重验注记（引用 §2 证据） | `src/shared/mcp-management.ts:9`、`src/shared/mcp-status.ts:10` | S |
| 2 | 合并视图镜像 `settings.exposeResources` 全局默认：service 读层文档 settings 块，`mergeMcpLayers`（或 service 侧）对未自带 exposeResources 的 server 应用默认，UI 可加「资源工具已被全局设置关闭」注记 | `src/shared/mcp-management.ts`（mergeMcpLayers + 形状）、`src/main/settings/mcp-service.ts`（读 settings）、`McpSection.tsx`（注记）、对应测试 | S/M（~1 天） |
| 3 | 无需改动：mcp-status、mcp-auth-bridge、contract 事件、smoke 断言、mcp-service 写器 | — | 0 |

若只做 #1（保真注释升级）即视为「已对 2.37.0 重验」；#2 是唯一实质行为面，且用户未启用新设置时零差异。

### C) 新能力盘点（仅盘点，不扩 scope）
1. **`settings.exposeResources`（全局资源工具开关，per-server 覆盖）**——最值得透出：MCP 设置区一个全局 toggle + 行级覆盖提示（S，可与 #2 合并做）。
2. **`/mcp jev setup` + Jev 语义搜索（SYSTEMONE_ENDPOINT/多 provider）**——可做未来 section，但涉及 key 管理、allowlist 选择、数据出域披露，M-L，建议独立票。
3. **`settings.allowInstall: false`（锁定安装）**——桌面 PiCode UI 价值低，仅文档级提及。
4. **`settings.deferWithMissingMetadata`（启动不等待 MCP）**——高级项，UI 价值低。

## 5. 证据索引（file:line 速查）
- 2.37.0 解包：`/tmp/mcp237/package/`（tgz: pi-mcp-adapter-2.37.0.tgz）
- applySettingDefaults：`/tmp/mcp237/package/config.ts:379,382-389`；writeJevSemanticSearchConfig：同文件 1189+
- 快照版本/频道：`/tmp/mcp237/package/types.ts:18,20` = `~/.pi/.../types.ts:18,20`（`pi-mcp-adapter/status/v1`、version 1）
- /mcp jev：`/tmp/mcp237/package/index.ts:1235,1247,1340`；allowInstall 门：1597-1603；defer：672,1115 + getDeferredSessionSnapshot（~1115 前）
- OAuth 修复：`/tmp/mcp237/package/mcp-auth-flow.ts:1120-1196`（尾部 return null）；/mcp-auth 注册：index.ts:1453（两版同）
- README 未变行：`/tmp/mcp237/package/README.md:76`
- PiCode fidelity 注：`src/shared/mcp-management.ts:9`、`src/shared/mcp-status.ts:10`；mergeMcpLayers：`src/shared/mcp-management.ts:272`；频道常量：`src/shared/mcp-status.ts:70`
- OAuth 桥消费面：`src/host/mcp-auth-bridge.ts:79-99`（start/hasCommand/runPrompt）
- smoke：`src/main/smoke.ts`（MCP 段 12903 起；ticket-96 断言 13155-13200；OAuth 腿 13425-13530）；`scripts/smoke/host-contract-smoke.mjs:172-208`（round I 种子）、322-358（assertRoundI）、1745+（round G）
- SDK 兼容：`package.json:72`（pi-coding-agent 0.86.1）；`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts`（before_agent_start 已存在）
