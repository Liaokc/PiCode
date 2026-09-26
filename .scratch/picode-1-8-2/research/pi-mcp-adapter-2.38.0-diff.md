# 调研报告：pi-mcp-adapter 2.37.0 → 2.38.0 升级差异与 PiCode 适配面

- 日期：2026-09-26（调研会话）
- 工作目录：`/Users/liaokechen/PiCode`；解包/diff 全在 `/tmp/mcp238`（`npm pack pi-mcp-adapter@2.38.0` → `tar -xzf`，得到 `package/` 即 2.38.0 干净源）
- 基线：`~/.pi/agent/npm/node_modules/pi-mcp-adapter`（2.37.0，用户级实装，settings.json `packages: npm:pi-mcp-adapter`）
- 铁律遵守：仓库与 `~/.pi` 全程只读（未跑任何 npm install 到既有位置，未改任何既有文件，未跑应用）；本文件是唯一写入物（`.scratch` 交付目录）。
- 上一版对照：`.scratch/picode-1-8-1/research/pi-mcp-adapter-2.37.0-diff.md`（版式与证据链对齐）。

## 1. CHANGELOG 逐字摘录（2.37.0 之后全部条目）

来源：`/tmp/mcp238/package/CHANGELOG.md`（2.38.0 tgz 自带），仅 [2.38.0] 一节（[Unreleased] 为空）。

### [2.38.0] - 2026-09-26

Highlights:
- Search-mode tools become full direct tools after a successful proxy call, without requiring a separate search first.
- Runtime-registered keep-alive servers now publish their tools even when Pi starts with no enabled MCP servers.
- Compact `mcpScript` results show which tools ran, how often they ran, and how many calls failed.
- Stdio configurations support home-relative paths, and MCP UI windows can open in Orca.
- OpenCode v2 imports, OAuth credential access, and Rust MCP schemas are more reliable.

Added:
- A successful `mcp({ tool })` call now activates a held `directTools: "search"` tool, so later calls use its full schema even if the model skipped search. Thanks to [@chiptoe-svg](https://github.com/chiptoe-svg) for [PR #670](https://github.com/nicobailon/pi-mcp-adapter/pull/670).
- MCP stdio server commands, arguments, and working directories now support home-relative paths. Thanks to [@FRFlo](https://github.com/FRFlo) for [PR #655](https://github.com/nicobailon/pi-mcp-adapter/pull/655).
- Set `MCP_UI_VIEWER=orca` to open MCP UI windows in Orca. Thanks to [@jaesimio](https://github.com/jaesimio) for [PR #654](https://github.com/nicobailon/pi-mcp-adapter/pull/654).

Fixed:
- Keep-alive servers registered at runtime now connect and publish their tools even when no configured servers are enabled at startup. Thanks to [@ahodges22](https://github.com/ahodges22) for [issue #671](https://github.com/nicobailon/pi-mcp-adapter/issues/671).
- Valid `ancestorConfigRoots` entries that do not contain the current working directory are ignored without warnings. Invalid entries still warn. Thanks to [@TheEdgeOfRage](https://github.com/TheEdgeOfRage) for [issue #668](https://github.com/nicobailon/pi-mcp-adapter/issues/668) and [PR #669](https://github.com/nicobailon/pi-mcp-adapter/pull/669).
- Collapsed `mcpScript` results now show the tools called, repeat counts, and a visible failure count instead of only the first output line. Unsafe or ambiguous tool names are quoted and escaped, and script code remains hidden. Thanks to [@sargismarkosyan](https://github.com/sargismarkosyan) for [PR #666](https://github.com/nicobailon/pi-mcp-adapter/pull/666).
- Metadata refreshes no longer reactivate an `mcp` gateway tool removed by the host. On hosts without `unregisterTool`, the adapter can still hide the gateway when direct tools cover the server and restore it when needed. Thanks to [@xulongwu4](https://github.com/xulongwu4) for [PR #665](https://github.com/nicobailon/pi-mcp-adapter/pull/665).
- `mcpScript` no longer asks models to load its intentionally hidden manual skill. Thanks to [@k03mad](https://github.com/k03mad) for [#659](https://github.com/nicobailon/pi-mcp-adapter/issues/659).
- OAuth credential reads now reuse a healthy keyring Entry without retaining secret values, avoiding repeated native sessions while still observing external updates. Thanks to [@mmarabel](https://github.com/mmarabel) for [#657](https://github.com/nicobailon/pi-mcp-adapter/issues/657).
- Suppressing MCP UI windows with `MCP_UI_VIEWER=none` / `off` / `disabled` no longer prints raw output into the TUI. Thanks to [@andreafspeziale](https://github.com/andreafspeziale) for [#656](https://github.com/nicobailon/pi-mcp-adapter/issues/656).
- The published package now includes the OAuth guide linked from the README. Thanks to [@dajiaohuang](https://github.com/dajiaohuang) for [PR #653](https://github.com/nicobailon/pi-mcp-adapter/pull/653).
- OpenCode v2 configs now import. Servers under `mcp.servers` are picked up, `disabled: true` servers are skipped, and the snake_case OAuth fields `client_id`, `client_secret`, and `auth_server_metadata_url` are mapped. OpenCode v1 configs keep working. Thanks to [@sleroq](https://github.com/sleroq) for [PR #650](https://github.com/nicobailon/pi-mcp-adapter/pull/650).
- Tools from Rust MCP servers, such as DBX, no longer print Ajv `unknown format "uint64" ignored` warnings on every call. Number formats like `uint64`, `uint32`, `uint`, and `uint8` are now recognized, and `type`/`minimum` still validate the values. Thanks to [@nightlitten](https://github.com/nightlitten) for [#649](https://github.com/nicobailon/pi-mcp-adapter/issues/649).

## 2. 面 diff 结果（2.38.0 vs 实装 2.37.0）

`diff -r`（排除 node_modules）变更文件全集（相对 2.37.0）：
`OAUTH.md`（新增文件）、`CHANGELOG.md`、`README.md`、`config.ts`、`direct-tool-surface.ts`、`index.ts`、`init.ts`、`json-schema-validator.ts`、`mcp-auth.ts`、`metadata-cache.ts`、`package.json`、`proxy-modes.ts`、`server-manager.ts`、`tool-result-renderer.ts`、`types.ts`、`ui-session.ts`、`utils.ts` + `dist/{config,json-schema-validator,mcp-auth,metadata-cache,server-manager,types.d.ts,utils}.*`（含 .map，与上述 .ts 一一对应，无新增 dist 条目）。

**未变（对 PiCode 关键，逐文件 cmp 验证）**：`mcp-status.ts`、`mcp-setup-panel.ts`、`mcp-panel.ts`、`lifecycle.ts`、`state.ts`、`mcp-callback-server.ts`、`secure-keyring.ts`、`mcp-install.ts`、`mcp-auth-flow.ts`、`oauth.ts`、`oauth-handler.ts`、`commands.ts`、`mcp-code.ts`、`mcp-oauth-provider.ts`、`mcp-auth-fetch.ts`、`mcp-bearer-store.ts`、`bearer-command-resolver.ts`、`mcp-tasks.ts`、`mcp-trace.ts`、`mcp-probe.ts`、`mcp-references.ts`、`mcp-output-guard.ts`、`mcp-script-worker.mjs`、`tool-approval.ts`、`tool-metadata.ts`、`tool-registrar.ts`、`sampling-handler.ts`、`elicitation-handler.ts`、`consent-manager.ts`、`error-signal.ts`、`errors.ts`、`failure-backoff.ts`、`glimpse-ui.ts`、`http-ca.ts`、`npx-resolver.ts`、`runtime-owner.ts`、`sandbox-proxy-template.ts`、`session-approvals.ts`、`session-recovery.ts`、`unix-socket-transport.ts`、`ui-app-bridge-helpers.ts`、`ui-resource-handler.ts`、`ui-server.ts`、`ui-stream-types.ts`、`ui-tool-visibility.ts`、`host-html-template.ts`、`panel-keys.ts`、`prompts.ts`、`onboarding-state.ts`、`claude-plugin-loader.ts`、`agent-plugin-loader.ts`、`agent-plugin-provenance.ts`、`resource-tools.ts`、`namespace-tools.ts`、`direct-tools.ts`、`lazy-loader.ts`、`search-ranking.ts`、`semantic-search.ts`、`jev-client.ts`、`jev-contracts.ts`、`jev-key-store.ts`、`mcp-keyring-helper.cjs`、`cli.js`、`init.ts` 之外的其余全部；**`skills/` 整目录字节相同**（`/mcp-scripting` 技能命令不变，`diff -r` 零输出）。

### 2.1 config.ts —— 层合并与导入面
- 合并本体与全部写器**逐行未变**：`mergeConfigs`（`config.ts:651`）、`mergeServerMaps`（`:670`）、URL-bound auth 剥离、transport 切换清场、`writeProjectServerDisabledOverride`（`:1270`）、`writeSharedServerEntry`（`:1464`）、`/mcp setup` 两个写目标、`applySettingDefaults`（`:379-386`，与 2.37 逐字相同）、`writeJevSemanticSearchConfig`（`:1212`）。
- 行为变更一：`ancestorConfigRoots` 校验放宽（`config.ts:624-627`）——存在且在 HOME 下但**不含 cwd** 的合法 root 不再 throw/warn，改为静默忽略（2.37 直接 `throw new Error()` 归入 invalid 告警）；真正非法（不存在/不在 HOME）的条目仍告警。纯 adapter 层发现行为，PiCode 不镜像 ancestor 发现。
- 行为变更二：OpenCode v2 导入（`config.ts:809-829`）——host 导入的 OpenCode 配置若把服务器嵌在 `mcp.servers` 下，先展平到顶层再 `mergeOpenCodeConfigs`；条目 `oauth` 块的 snake_case 字段 `client_id`/`client_secret`/`auth_server_metadata_url` 映射为 camelCase。v1 形状继续可用。
- 行为变更三：OpenCode 导入跳过 `disabled: true` 服务器（`config.ts:1029`，2.37 只查 `enabled === false`）；`:1056-1064` OAuth 字段提取重排（无行为差异）。

### 2.2 types.ts —— 设置面 + 状态契约
- `MCP_STATUS_SNAPSHOT_VERSION = 1`（`types.ts:20`）与 `MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1"`（`types.ts:18`）**两版相同，未 bump、未变名**。
- `viewer` 联合类型加 `"orca"`（`types.ts:195`，additive）；search-mode 工具的 doc 注释更新（`:743`，纯注释）。其余 settings 面零变化。

### 2.3 index.ts —— 命令面与生命周期
- `/mcp` 子命令表（`setup`/`jev`/`edit`/`logout`/`token`/`disable`/`enable`，`index.ts:1323-1398`）、`/mcp-auth` 注册（`:1450`）、`mcp({action:"install"})` 的 `allowInstall` 门（`:1594`）——内容逐行未变，仅因上游改动整体上移 3 行。
- **新激活入口**（PR #670，`index.ts:1939-1955`）：`mcp({ tool })` 代理调用成功后（result.details 无 error、server/canonicalTool 均为 string），`holdLazyToolsInactive()` + `activateSearchMatches([{ server, tool: canonicalTool }])`，把该 search-mode 工具转正为 direct 工具，结果附加 `details.activated` + `addedToolNames`；失败调用（lookup/approval/工具错误）不激活任何东西。`activateSearchMatches` 本体（`:458-476`）与 2.37 相同。
- **gateway 重激活修复**（PR #665，`index.ts:1998-2022` + `:504-512`）：`fallbackDeactivatedTools` 现在记录 adapter 自有的 mcp gateway 降级所有权——宿主重新激活 mcp 时 `fallbackDeactivatedTools.delete("mcp")` 结束 fallback 所有权，之后宿主再移除不会被误认为 adapter 自己的降级；无 `unregisterTool` 的宿主上 gateway 仍可隐藏/恢复。
- mcpScript 工具描述去掉「Load the mcp-scripting skill for the full workflow guide」尾句（`index.ts:1508`，fix #659）。
- `directToolCounts` 同步逻辑（`index.ts:615-620`）未变。

### 2.4 mcp-auth.ts —— OAuth keyring 读取复用（fix #657）
- 新增模块级 `keyringEntries: Map<string, KeyringEntry>`（`mcp-auth.ts:213`）：`keyringAuthSecretStore.read`（`:242-255`）优先复用缓存的健康 Entry；keyring v2 对 provider/session 故障会 throw，捕获后删缓存并重建 Entry 重试一次（陈旧原生 Entry 在 keyring 守护进程重启后可能残留）；`write`（`:258-261`）写前清缓存再建新 Entry；`remove`（`:264`）清缓存后 `deleteCredential`。不保留 secret 值，仅复用 Entry 句柄，外部更新（如用户手动删 keychain 条目）仍可被观察到。
- 测试面新增 `setTestKeyringEntryClass`（`:330-335`）。
- **未变**：`AUTH_SECRET_SERVICE = 'pi-mcp-adapter.oauth'`（`:23`）、`AUTH_CACHE_DISABLED_ENV`（`:40`，`PI_MCP_ADAPTER_DISABLE_AUTH_CACHE`）、`MCP_OAUTH_DIR` 覆盖（`:634`）、`getKeyringEntry`（`:478-484`）。`mcp-auth-flow.ts`、`mcp-callback-server.ts`、`oauth-handler.ts`、`mcp-keyring-helper.cjs` 字节相同——`/mcp-auth` 流本体零变化。

### 2.5 其余变更文件
- **utils.ts**（PR #655）：路径解析函数尾部改为 `expandHomePath(interpolateEnvVars(value))`（`utils.ts:250`）；新导出 `expandHomePath`（`utils.ts:254-261`）——展开前导 `~/`（win32 另支持 `~\` 并归一化分隔符；POSIX 上反斜杠保持字面量）。env 插值与 ~ 展开的组合顺序：先插值后展开。
- **server-manager.ts**（PR #655）：stdio spawn 时 `command` 走 `resolveConfigPath`（`server-manager.ts:1048`）、`args` 每项 `expandHomePath(interpolateEnvVars(…))`（`:1051-1052`）、`cwd` 走 `expandHomePath`/`resolveConfigPath`（`:1053-1054`）；built-in Agent Plugin 的 args/cwd 保持字面量（`literalArgs`/`literalCwd` 分支）。**config 文件里保存的仍是原始 `~/...` 字符串，展开只发生在 spawn 时**。
- **metadata-cache.ts**：缓存指纹的 `command` 字段改存 `resolveConfigPath(definition.command, environment)`（`metadata-cache.ts:89`）——`~` 路径服务器的缓存键在升级后会变一次（一次性缓存失效/重连，adapter 内部行为）。
- **init.ts**（fix #671）：零启用服务器时不再提前 `return`——2.37 在 `serverEntries.length === 0` 时 notify + `publishMcpStatusSnapshot` + return（`~/.pi/.../init.ts:271-277`）；2.38 只在 `allServerEntries.length > 0 && hasUI` 时 notify（`init.ts:270-272`），生命周期机制（`setGlobalIdleTimeout`、回调注册、`startHealthChecks`）与末尾 `publishMcpStatusSnapshot(state)`（`init.ts:525`）无条件执行，metadata-cache 块改为 `serverEntries.length > 0` 才走（`:276-288`）。效果：运行时注册的 keep-alive 服务器在启动零启用服务器时也能连接并发布工具。运行时注册本体 `registerRuntimeServer`（`index.ts:734-780`：加入 `state.config.mcpServers` + `attachRuntimeServerLifecycle` + `syncToolSurface`）未变。
- **json-schema-validator.ts**（fix #649）：新常量 `SCHEMARS_NUMERIC_FORMATS`（`int/int8/int16/int128/uint/uint8/uint16/uint32/uint64/uint128`，`json-schema-validator.ts:14-27`）注册为恒真 format，仅消 Ajv「unknown format "uint64" ignored」告警；`type`/`minimum` 校验不变；`int32/int64/float/double` 仍由 ajv-formats 处理。
- **proxy-modes.ts**：resource 工具调用的 details 加 `canonicalTool: toolMeta.name`（`proxy-modes.ts:1377`）——为 §2.3 的新激活入口提供被调工具身份。
- **tool-result-renderer.ts**（fix #666）：紧凑行 `CompactMcpToolResult` 加 `status` 字段（`:78-79`，标题尾 `✗N`，永不被截断、标题让位 `:118-126`）；新 `formatMcpScriptCallSummary`（`:356-421`）从 `details.calls` 追踪聚合「工具×次数 · 其他操作 · 失败数」；`formatTracedPath`（`:349-354`）对非标识符样路径做 JSON 引号+全非 ASCII 转义（防注入/防伪装）；紧凑行构建 `:539-543`、compactTitle `:337-340`。脚本代码永不进紧凑行。
- **ui-session.ts**（PR #654 + fix #656）：`UiSessionViewer` 加 `"orca"`（`:38`）；新 `openInOrcaBrowser`（`:146-156`，`execFile("orca", ["goto", "--url", url])`，10s 超时）；viewer 分派顺序改为 orca 显式偏好优先（`:514-527`，失败回退系统浏览器），glimpse 自动探测/浏览器回退逻辑本体未变；**suppressed 分支删除 `log.info("Suppressing MCP UI window …")`**（2.37 `ui-session.ts:489` → 2.38 无此行，只保留 `ui.notify`，fix #656——不再向 TUI 打原始输出）。
- **direct-tool-surface.ts**：大 direct-tools 告警文案加「或 mcp({ tool }) 调用它们」（`:219`，纯文案）。
- **package.json**：version 2.38.0；`files` 加 `OAUTH.md`；**peerDependencies 逐字相同**（`@earendil-works/pi-ai: ^0.84.1 || ^0.85.0 || ^0.86.0 || ^0.87.0` 等，Python 字典比对 `peer identical: True`）；唯一 deps 变化 `@napi-rs/keyring ^1.3.0 → ^2.1.0`（原生模块 major bump；adapter 的 `KeyringEntry(service, account)` 用法与 keychain 服务/账号名未变，`mcp-keyring-helper.cjs` 字节相同）。
- **OAUTH.md**（新文件）：OAuth 2.1 + PKCE 指南（2.37 README:437 已链接但未随包发布，fix #653）。纯文档。
- **README.md**：4 处内容——ancestorConfigRoots 行为措辞（`:74`、settings 表 `:518`）；**新增 stdio ~ 展开段落（`:116-122`：`~/` 在 command/args/cwd 展开、win32 `~\`、裸命令仍走 PATH、built-in Agent Plugin args 保持字面量）**；disableProxyTool 行与 search-mode 段落更新（`:533`、`:794`，激活入口= gateway 的 search 或成功 tool 调用）；MCP_UI_VIEWER=orca 文档（`:857`）。**PiCode 引用的第 76 行语句「`/mcp setup` write targets and project-local `/mcp disable` and `/mcp enable` overrides are unchanged」逐字在案（`README.md:76`，行号都未变）**。

## 3. 契约面核对（PiCode 硬依赖）

| 契约项 | 2.37.0 | 2.38.0 | 判定 |
|---|---|---|---|
| `MCP_STATUS_SNAPSHOT_VERSION` | 1（types.ts:20） | 1（types.ts:20） | 未 bump ✓ |
| `MCP_STATUS_EVENT` 频道 | `pi-mcp-adapter/status/v1`（types.ts:18） | 同 | 未变名 ✓ |
| `mergeConfigs`/`mergeServerMaps`/URL-bound auth 剥离/transport 清场 | config.ts:624/643 等 | config.ts:651/670 等，逐行未变 | ✓ |
| `writeProjectServerDisabledOverride`/`writeSharedServerEntry`/`/mcp setup` 两写目标 | 在 | 在（config.ts:1270/1464），逐行未变 | ✓ |
| `applySettingDefaults`（exposeResources 全局默认） | config.ts:379-389 | 同（:379-386 逐字） | ✓ |
| `writeJevSemanticSearchConfig` | 在 | 在（config.ts:1212），未变 | ✓ |
| `/mcp` 子命令表（setup/jev/edit/logout/token/disable/enable） | index.ts:1326-1401 | index.ts:1323-1398，内容未变 | ✓ |
| `/mcp-auth` 注册 | index.ts:1453 | index.ts:1450，未变 | ✓ |
| `mcp({action:"install"})` allowInstall 门 | index.ts:1597-1603 | index.ts:1594-1600，未变 | ✓ |
| `getValidToken`/OAuth 流本体 | mcp-auth-flow.ts | 字节相同 | ✓ |
| peer `@earendil-works/pi-ai` | `^0.84.1 \|\| ^0.85.0 \|\| ^0.86.0 \|\| ^0.87.0` | 逐字相同 | ✓（PiCode 捆绑 SDK 0.87.1，PiCode package.json:72，落在 `^0.87.0` 内） |
| README "write targets … unchanged" 语句 | README.md:76 | README.md:76 逐字在案 | ✓ |

**结论：全部硬契约面原样成立，无 bump、无变名、无 peer 排除。**

## 4. 2.38.0 初判线索逐条实证

### a) stdio 配置 home 相对路径（PR #655）
实现：`utils.ts:250-261`（`expandHomePath` 导出 + 插值后展开）、`server-manager.ts:1048,1051-1054`（spawn 时 command/args/cwd 展开，Agent Plugin args/cwd 字面量例外）、`metadata-cache.ts:89`（缓存指纹存展开后 command）。**config 文件与合并结果保存/读取的都是原始 `~/...` 字符串**——展开纯属运行时 spawn 行为。
判定：PiCode 合并/编辑/显示模型**不需要跟进**——mcp-management 的合并视图忠实显示文件原文（= adapter 读到的原文），表单写入原文即被 adapter 正确展开。用户在 PiCode 加/编辑框里填 `~/bin/server` 现在运行时直接可用（2.37 会当相对路径）。可选的 UI 增强见 §8-C。唯一副作用：含 `~` 的 command 的缓存指纹变化 → 升级后一次性缓存失效/重连（adapter 内部）。

### b) search-mode 工具经一次成功代理调用转正（PR #670）
实现：`index.ts:1939-1955`（成功代理调用 → `activateSearchMatches`，details 加 `activated`/`addedToolNames`）；配套 `proxy-modes.ts:1377`（resource 调用 details 带 `canonicalTool`）。2.37 的 `searchActivatedTools` 持有逻辑（session_start 清空 + `before_agent_start` holdLazyToolsInactive，`index.ts:1151` 等）未变。
对 mcp-status 快照的影响：**零**。快照的 `directToolCount` 来自 `state.directToolCounts`（`mcp-status.ts:30`，由 `index.ts:615-620` 在 direct 工具面同步时写入），激活只改 `pi.setActiveTools`，不改 directToolCounts，激活路径也不触发快照重发。六态投影（connected/needs-auth/failed/cached/not-connected/disabled + 第七态诚实降级）完全不受影响。这是纯模型可见的运行时行为面。

### c) OpenCode v2 imports（PR #650）
实现：`config.ts:809-829`（`mcp.servers` 展平 + snake_case OAuth 映射，导入前归一化）、`:1029`（`disabled: true` 跳过）。属于 adapter 的 host 导入（只读兼容发现）面——与 Cursor/Claude/Codex 导入同层。
判定：**没有新层进入 PiCode 需要镜像的配置面**。PiCode 的层模型（`buildMcpLayerDescriptors`）刻意排除 host-import 与 ancestor 发现（只读 adapter 特性、无 PiCode 写路径，mcp-management.ts 注释与 §6-① 证据）；外部 host 工具配置 = 只读兼容发现绝不写、`~/.agents` 跨工具共享文件只读拒写的数据安全红线均不受影响。OpenCode 配置进入的是 adapter 的 effective config（运行时/快照可能多出若干服务器名），PiCode 快照投影按名字 join 到配置行、无行则不显示——与 2.37 对 Cursor/Claude 导入服务器的现状一致，非新缺口。

### d) mcpScript 结果统计展示（PR #666 + fix #659）
实现：`tool-result-renderer.ts:78-79,118-126,337-421,539-543`（紧凑行 `✗N` + 工具×次数预览 + 路径转义）；`index.ts:1508`（描述不再引导模型加载隐藏技能）。这是 adapter 的 TUI 渲染器面；PiCode 转录渲染自绘，不经此面。
判定：`skills/` 整目录字节相同 → PiCode `src/main/smoke.ts:12854-12871` 断言 `mcp-scripting` 与 `council-mode` 技能在位**不受影响**。模型可见的唯一变化是 mcpScript 工具描述文本（少了尾句）——PiCode 无断言。无需跟进。

### e) keep-alive 运行时注册服务器发布修复（issue #671）
实现：`init.ts:270-272`（零启用服务器不再提前 return，生命周期机制无条件装配，末尾 `publishMcpStatusSnapshot` `:525`；cache 块 `:276-288`）；运行时注册 `index.ts:734-780` 与 server-manager/lifecycle/mcp-status 的注册与发布路径本体未变。
判定：对 PiCode 为**纯 additive**——PiCode 不运行时注册 MCP 服务器；快照可能多含运行时注册的服务器名（零配置启用时也不再是空快照），投影按名字 join、无配置行不显示。快照形状/版本/频道全部未变。无死面、无降级。

### f) OAuth keyring 读取复用（fix #657）
实现：`mcp-auth.ts:213,242-264`（Entry 句柄缓存 + 陈旧原生 Entry 一次性重建重试）。`/mcp-auth` 流本体（`mcp-auth-flow.ts`/`mcp-callback-server.ts`/`oauth-handler.ts`）、keychain 服务/账号名（`AUTH_SECRET_SERVICE` `:23`）、`MCP_OAUTH_DIR`（`:634`）、`PI_MCP_ADAPTER_DISABLE_AUTH_CACHE`（`:40`）全部未变；`mcp-keyring-helper.cjs` 字节相同。
判定：PiCode 的 OAuth 桥（§6-③）与 smoke 的 mock OAuth 双腿（自动+手动粘贴）骑的全部表面未变。唯一注意点：依赖 `@napi-rs/keyring` ^1.3.0 → ^2.1.0（原生模块 major bump，adapter 用法不变）——建议升级实装后跑一次完整 smoke 验证 macOS keychain 行为（见 §8 残余风险）。

### g) MCP_UI_VIEWER=orca（PR #654）
实现：`types.ts:195`（viewer 联合加 "orca"）、`ui-session.ts:38,146-156,514-527`（`execFile("orca", ["goto", "--url", url])`，失败回退系统浏览器）。配套 fix #656：suppressed（none/off/disabled）分支删除 `log.info` 原始输出（2.37 `ui-session.ts:489` 已删）。
判定：PiCode 不设置也不消费 `MCP_UI_VIEWER`（内嵌会话宿主不开 MCP UI 窗口）——**无消费面**。新能力盘点见 §8-C。

## 5. PiCode 消费面逐项判定

### ① src/shared/mcp-management.ts（合并模型）
- 层次优先级（`:11-13` 层表、`:148-161` buildMcpLayerDescriptors）、per-field 合并（`mergeServerEntry`，transport 清场 `:274-279`、URL-bound auth 剥离）、`mergeMcpLayers`（`:294`）、`STDIO_ONLY_FIELDS`（`:254`）、`~/.agents` 胜出只读拒写（`:330` 徽标、`editTargetPathFor` 返回 null）、canonical 写面 `isCanonicalMcpWritePath`（`:409`）：**全部与 2.38 行为一致**。adapter 合并本体逐行未变（§2.1）；~ 展开是运行时 spawn 行为，文件/合并层不展开，显示保真成立。
- 1.8.1 遗留的 `settings.exposeResources` 显示保真缺口**原样存续**（2.38 `applySettingDefaults` 逐字未变；PiCode `mergeMcpLayers` 仍不读层文档 settings 块）——非 2.38 引入，无恶化。
- 需要做的只有 fidelity 注释升级（`:9` 现写 2.37.0）。

### ② src/shared/mcp-status.ts（状态投影）
- **完全兼容**：adapter `mcp-status.ts` 字节未变；`MCP_STATUS_SNAPSHOT_VERSION = 1`、频道 `pi-mcp-adapter/status/v1` 均未变（§2.2/§3）。六态 + 第七态诚实降级、`toolCount`/`directToolCount` raw 校验（`:100`）、bounded 投影全部照旧。2.38 的激活/keep-alive 改动均不触碰快照形状（§4-b/e）。
- 需要做的只有 fidelity 注释升级（`:10` 现写 2.37.0）。

### ③ src/host/mcp-auth-bridge.ts（OAuth 桥）
- **兼容**：`hasCommand('mcp-auth')` 守卫（`:79`）骑的命令注册未变（§3）；`/mcp-auth` 经 `session.prompt` 的命令形状未变；流中 notice/input 转发形状未变；keyring 读取复用是 adapter 进程内行为（§4-f），不经 PiCode 面。零改动。

### ④ src/host/mcp-status-bridge.ts（状态桥）
- **兼容**：频道订阅 + `parseMcpStatusSnapshot` 校验 + additive `mcp_status` 契约事件转发，纯接收零命令；契约（version 1、bounded 字段）未变。零改动。

### ⑤ src/main/settings/mcp-service.ts（服务写器）
- **兼容**：层文档读取、disabled 旗标写（镜像未变的 `writeProjectServerDisabledOverride`）、setup 目标写（镜像未变的 `writeSharedServerEntry`/两写目标）、symlink 保持原子替换（镜像 2.35 起未变的 `writeConfigText`）——全部骑未变表面（§2.1）。零改动。

### ⑥ src/renderer/src/components/settings/McpSection.tsx（设置 UI）
- **兼容**：双卡、来源/层数/OAuth/Disabled 徽标、活状态徽标 + tool 计数芯片（`:425-444`）全部骑未变的层报告/快照形状。零改动。可选增强见 §8-C。

### ⑦ src/main/smoke.ts MCP 段（~12892-13600）
- 全部断言骑未变表面：双卡/来源徽标/合并 summary/disable 旗标写/加改删/OAuth 自动腿+手动粘贴腿（mock OAuth 服务器 + `/mcp-auth` 流，`18497+`）/ticket-96 状态徽标（`:13141-13200`：bearer-api connected、eager-cms needs-auth、lazy not-connected、disabled 无运行时徽标）/零触发红线（`:13535-13537`）/外部配置字节不变（`:12960-12970` 种子 cursor+claude，前后字节比对）。
- 沙箱 symlink 真实实装 adapter（`seedSandboxPackage`，`smoke.ts:12911`）——操作者升级到 2.38 后 smoke 自动跑 2.38，上述表面全部成立。`mcp-scripting` 技能断言（`:12854-12871`）骑字节相同的 skills/。keychain 清理用 `security` CLI 直删 `-s pi-mcp-adapter.oauth -a <account>`（服务/账号名未变，§4-f）。
- 唯一运行时变量：`@napi-rs/keyring` major bump（§4-f/§8 残余风险）。

### ⑧ scripts/smoke/host-contract-smoke.mjs
- Round G（`:61+` 文档、ghost server not-found → `mcp_auth_completed(ok=false)`）：骑未变的 `/mcp-auth` not-found 路径与 notice 转发。**不死**。
- Round I `assertRoundI`（`:321-357`：version 1、bounded 字段、lazy=not-connected、off=disabled）：骑未变的 mcp-status.ts 与快照形状。种子场景（有启用服务器）不走 init.ts 改动的零启用分支，行为等价。**不死**。

### ⑨ tests/shared/mcp-management.test.ts（票 148 jev 共存用例）
- 纯 PiCode 侧测试（`:119-125` settings.jev parse 保留、`:237-245` 合并只读服务器条目、`:408-426` 写后幸存）：骑 PiCode 自身模型 + adapter 未变的 `writeJevSemanticSearchConfig`（config.ts:1212）。**全部继续通过**。零改动。

### Seam-1 复核
`grep` 全 src/scripts/tests：PiCode **零 `pi-mcp-adapter` import**（Seam-1 守则原样成立）——升级不产生任何编译/加载面耦合。

## 6. 1.8.1 遗留盘点项与 2.38.0 的交互

1. **settings.exposeResources 全局默认投影**：2.38 `applySettingDefaults`（config.ts:379-386）与 2.37 逐字相同——1.8.1 的显示保真缺口（PiCode mergeMcpLayers 不读 settings 块）**原样存续，无新交互、无恶化**。归 1.8.2 迭代自行决定是否补（S/M，见 §8-B）。
2. **/mcp jev setup UI**：`/mcp jev` 子命令（index.ts:1337）与 `writeJevSemanticSearchConfig` 未变——无交互。
3. **cost RPC 桥接 / child-status "started" 转发（pi-subagents 面）**：2.38 变更集（§2 全表）不含任何 subagent 相关文件（`agent-plugin-loader.ts`/`session-approvals.ts` 等全部字节相同）——**零交互**。

## 7. 结论

### A) 用户级直接升 2.38.0：现行 PiCode 会死/降级哪些面
**无硬死面。** 全部契约面——合并模型、状态投影 v1（版本 1 + 频道名）、OAuth 桥、/mcp 命令面、IPC 事件、peer 范围（含 SDK 0.87.1）——在 2.38.0 下原样成立（§3/§5 证据）。
**软降级：无新增。** 1.8.1 已在案的 `settings.exposeResources` 显示保真缺口原样存续（仅当用户启用该设置；§6-1）；2.38 的全部改动（~ 展开、search 激活、keep-alive、OpenCode v2、mcpScript 统计、keyring 复用、orca）都不触碰 PiCode 的任何显示/写入/断言面。另两条非降级注意点：含 `~` 的 stdio command 缓存指纹变化（升级后一次性缓存失效/重连，adapter 内部）；`@napi-rs/keyring` 原生模块 major bump（用法不变，建议升级后跑一次完整 smoke）。

### B) 适配清单（改动点 / 文件 / 量级）
| # | 改动 | 文件 | 量级 |
|---|---|---|---|
| 1 | 两处 fidelity 注释 2.37.0 → 2.38.0 + 重验注记（引用本报告 §2/§3 证据；mcp-management 侧加一句「~ 展开为运行时 spawn 行为、文件层不展开，显示保真成立」；mcp-status 侧加一句「2.38 的激活/keep-alive 改动不触碰快照形状」） | `src/shared/mcp-management.ts:9`、`src/shared/mcp-status.ts:10` | S |
| 2 | （承接 1.8.1 遗留，可选）合并视图镜像 `settings.exposeResources` 全局默认 | `src/shared/mcp-management.ts`（mergeMcpLayers + 形状）、`src/main/settings/mcp-service.ts`（读 settings 块）、`McpSection.tsx`（注记）、对应测试 | S/M |
| 3 | 无需改动：mcp-status、mcp-auth-bridge、mcp-status-bridge、mcp-service 写器、McpSection、smoke 断言、host-contract Round G/I、jev 共存测试 | — | 0 |

只做 #1 即视为「已对 2.38.0 重验」。#2 与 2.38 无关（2.37 起就存在的缺口），归迭代自行摆桌。

### C) 新能力盘点（仅盘点，不扩 scope）
1. **stdio home 相对路径（`~/` in command/args/cwd）**——最值得透出：PiCode 加/编辑对话框的 command/args/cwd 字段帮助文案加一句「支持 `~/` 开头路径」（S；模型零改动，运行时已生效）。
2. **MCP_UI_VIEWER=orca**——PiCode 无消费面（不设置该 env、不开 MCP UI 窗口）。不透出。
3. **mcpScript 紧凑统计（工具×次数/失败数）**——adapter TUI 渲染器面，PiCode 转录自绘。无消费面。若未来 PiCode 想展示 mcpScript 调用摘要，可参考 `formatMcpScriptCallSummary` 的转义纪律（防注入）。
4. **search-mode 经成功调用转正**——纯模型运行时行为。无 UI 面。
5. **OpenCode v2 导入**——host 只读导入面，在 PiCode 数据安全红线之外。无消费面。
6. **keep-alive 运行时注册修复**——PiCode 不运行时注册。无消费面。
7. **OAuth keyring 读取复用**——adapter 进程内。无消费面。
8. **Ajv Rust 数字 format、ancestorConfigRoots 放宽、OAUTH.md 随包**——内部/文档。无消费面。

### D) 证据索引（file:line 速查）
- 2.38.0 解包：`/tmp/mcp238/package/`（tgz: pi-mcp-adapter-2.38.0.tgz）
- 快照版本/频道（未变）：`/tmp/mcp238/package/types.ts:18,20` = `~/.pi/.../types.ts:18,20`
- 合并/写器（未变）：`/tmp/mcp238/package/config.ts:651`（mergeConfigs）、`:670`（mergeServerMaps）、`:379-386`（applySettingDefaults）、`:1212`（writeJevSemanticSearchConfig）、`:1270`（writeProjectServerDisabledOverride）、`:1464`（writeSharedServerEntry）
- config.ts 变更：ancestorConfigRoots `:624-627`；OpenCode v2 `:809-829`；disabled 跳过 `:1029`；OAuth 字段重排 `:1056-1064`
- index.ts：新激活 `:1939-1955`；gateway 重激活 `:1998-2022` + fallback 所有权 `:504-512`；mcpScript 描述 `:1508`；/mcp 子命令 `:1323-1398`；/mcp-auth `:1450`；allowInstall 门 `:1594`；directToolCounts `:615-620`；registerRuntimeServer `:734-780`
- utils.ts：`expandHomePath` `:250-261`；server-manager.ts：spawn 展开 `:1048,1051-1054`；metadata-cache.ts：`:89`
- init.ts（keep-alive 修复）：零启用分支 `:270-272`、cache 块 `:276-288`、末尾发布 `:525`（对照 2.37 `~/.pi/.../init.ts:271-277` 的提前 return）
- mcp-auth.ts：keyringEntries `:213`、read `:242-255`、write `:258-261`、remove `:264`、setTestKeyringEntryClass `:330-335`；AUTH_SECRET_SERVICE `:23`、AUTH_CACHE_DISABLED_ENV `:40`、MCP_OAUTH_DIR `:634`（均未变）
- ui-session.ts：orca `:38,146-156,514-527`；suppressed log.info 删除（2.37 `:489` → 2.38 无）
- tool-result-renderer.ts：status `:78-79,118-126`、compactTitle `:337-340`、formatTracedPath `:349-354`、formatMcpScriptCallSummary `:356-421`、紧凑行 `:539-543`
- json-schema-validator.ts：`SCHEMARS_NUMERIC_FORMATS` `:14-27`、addKnownFormats `:61,77`
- proxy-modes.ts：canonicalTool `:1377`
- package.json：peer 逐字相同（Python 比对 True）；deps 唯一变化 `@napi-rs/keyring ^1.3.0→^2.1.0`；files += OAUTH.md
- README.md：未变语句 `:76`；~ 展开段 `:116-122`；orca `:857`；search 激活 `:533,794`；ancestorConfigRoots `:74,518`
- PiCode：fidelity 注 `src/shared/mcp-management.ts:9`、`src/shared/mcp-status.ts:10`；mergeMcpLayers `:294`；STDIO_ONLY_FIELDS `:254`；只读拒写 `:330`；canonical 写面 `:409`；raw 校验 `src/shared/mcp-status.ts:100`；OAuth 桥 `src/host/mcp-auth-bridge.ts:79,96`；smoke MCP 段 `src/main/smoke.ts:12892-13600`（技能断言 `:12854-12871`、状态徽标 `:13141+`、零触发 `:13535`、外部字节 `:12960-12970`、mock OAuth `:18497+`）；host-contract Round G/I `scripts/smoke/host-contract-smoke.mjs:61+,321-357`；jev 共存测试 `tests/shared/mcp-management.test.ts:119-125,237-245,408-426`；SDK 版本 `package.json:72`（0.87.1 ∈ ^0.87.0）

## 残余风险与待复核
- `@napi-rs/keyring` ^1.3.0 → ^2.1.0：adapter 的 Entry(service, account) 用法、keychain 服务/账号名、helper cjs 均未变，但原生模块本身换了 major——升级实装后建议跑一次完整 `npm run smoke`（ticket-89/96 OAuth 双腿会实测 macOS keychain 写读删）。
- 含 `~` 的 stdio command 服务器：升级后 metadata 缓存指纹变化 → 首次使用一次性重连/重取工具列表（adapter 内部，无需 PiCode 动作）。
- 无「待复核」未决项：所有初判线索均已 file:line 实证。
