# 89: MCP 管理节——设置窗配置面（双卡/启停/增改删/OAuth）

**What to build:** 设置窗新增 **MCP 节**（Skills/Packages 同级），端到端：①**全局卡/项目卡**（Skills 双卡同款）——server 列表读 adapter 的多层配置（user-global shared → Pi 全局覆盖 → 项目 .mcp.json → Pi 项目覆盖），来源徽标 + 有效配置合并视图（胜出来源可见）；②**启停** per server（写 `.pi/mcp.json` 的 disabled 标志 = adapter `/mcp enable|disable` 同语义）；③**增改删 server**（写入目标 = adapter `/mcp setup` 的两个正规目标：项目 `.mcp.json` / 用户全局共享配置 `~/.config/mcp/mcp.json`）；④**OAuth 授权流**——server 行 Authenticate → host 经 adapter 起流 → 系统浏览器打开 → localhost 回调自动完成；**手动粘贴回调 URL 兜底输入**（网关场景）；⑤每层打开配置文件入口；needs-auth 状态徽标（状态数据本身是票 96）。红线：**OAuth 凭据全在 adapter/系统钥匙串，PiCode 零凭据读写**；外部 host 工具配置（Cursor/Claude 等）= 只读兼容发现、绝不写。

**背景（取证）：** 1.5 Q1「MCP 管理出局」裁决重开（前提变化实证：usage.md Design Principles =「不内建、可装包」；操作者已装 pi-mcp-adapter 2.34.0 全局 Pi 包——`~/.pi/agent/settings.json` packages 在册；TUI `/mcp` 全管理面板在案）；操作者机器当前**零 MCP 配置文件**（空态如实 = 首用户形态，Packages 节先例）。适配器配置语义全录 `../intake-grilling.md` R3/R4 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] Seam-1 表驱动：多层配置解析/合并（优先级序 + 胜出来源标注）与写入目标解析（增改删 → 正确层文件）全表；空态如实
- [x] electron smoke：双卡渲染 + 来源徽标；启停写 `.pi/mcp.json` disabled 标志（文件断言）；增/改/删 server 落盘正确层；打开配置文件入口（`npm run smoke:electron` 全套 **EXIT=0 全绿**，`settings_mcp` 十四断言全过——`settings_mcp_done`；锁屏阻塞已随操作者解锁解除）
- [x] OAuth 流：Authenticate 触发 host 桥接 → 浏览器打开（shell 外部打开断言）→ 回调自动完成路径（mock/记录）+ 手动粘贴兜底输入可用；**凭据零落 PiCode** 断言（electron stage 实测全过：`mcp_oauth_autocomplete_ok` + `mcp_paste_dialog_ok` + `mcp_oauth_manual_paste_ok` + `mcp_credentials_zero_leak_ok`；另有无头 verify 脚本 + host-contract smoke Round G 双证据）
- [x] 外部 host 配置文件零写入断言
- [x] 安全文案沿用 Pi 官方口吻（packages run with full system access 族）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-18 (implement session t89)：端到端落地于 `t89-mcp-config`（基于 main 323e1cd）。
  - **Seam-1 纯模型**（新 `src/shared/mcp-management.ts` + `tests/shared/mcp-management.test.ts` 50 例表驱动）：
    - 层解析 = adapter `getConfigSources` 的 PiCode 管辖面：`shared-global`(~/.config/mcp/mcp.json) → `agents-global`/`agents-nested-global`(~/.agents/*) → `pi-global`(<agentDir>/mcp.json) → `shared-project`(.mcp.json) → `pi-project`(.pi/mcp.json)，precedence 序 + 项目层仅随 cwd 出现；host-import/ancestor discovery 属 adapter 只读特性、无 PiCode 写路，不入模型。
    - **合并 = adapter mergeServerMaps 忠实移植**：逐字段 spread + 三条安全规则表驱动验证——换 transport（stdio↔url↔socket）丢弃对侧字段族；url 重指向丢弃 URL 绑定凭据族（headers/bearer*/requestHeadersCommand/caFile + oauth，除非基座 `oauth:false`）；url 相同则部分覆盖继承。
    - **禁用写推导 = `writeProjectServerDisabledOverride` 移植**（`deriveDisabledFlagWrite`）：disable 只写 `disabled:true` 旗标（定义零复制——凭据永不流入 override 文件）；enable 丢旗标、下层自身 disabled 时显式 `disabled:false`；清空条目整个移除；legacy `mcp-servers` 文档保留其键（同 adapter）。
    - **写入目标解析**：add = `/mcp setup` 两目标（`<cwd>/.mcp.json` / `~/.config/mcp/mcp.json`）；edit/delete = 胜出层自有文件，`~/.agents/*` 胜出 = 拒写（adapter 同纪律：其 writePath 重定向到 Pi global，PiCode 干脆拒绝并给指路文案）；`isCanonicalMcpWritePath` = 动作时红线闸（四文件白名单，session 文件/外部 host 配置一律拒）。表驱动断言外部配置（cursor/claude/codex/.agents）全 false。
    - OAuth 判定 = `supportsOAuth` 移植（url + 非 `auth:false`/`oauth:false` + 显式 oauth 或无 headers 的自动探测）；空态如实（零层零行零捏造）；文案表（删除确认带文件路径 + 遮蔽恢复语义、`~/.agents` 只读拒因、"MCP servers run with full system access. Add only servers you trust."）。
  - **McpService**（`src/main/settings/mcp-service.ts` + `tests/main/mcp-service.test.ts` 19 例真实临时目录）：读侧主进程直读小 JSON（无 probe host、无 SDK——ADR-0003）；每次动作时重读 + 纯模型推导 + 原子写（temp+rename，2 空格 + 尾换行 = adapter writer 同形）。`PICODE_MCP_HOME` 沙箱 override（home 系全局层与外部配置的可测性——真实 ~/.config 永不被 smoke 触碰）；agentDir 沿 SkillsService 规则（PICODE_PI_AGENT_DIR）。reveal = 层文件自身存在则显文件，否则最近存在祖先；仅层描述符内的路径可 reveal（防任意路径导航）。
  - **OAuth host 桥**（`src/host/mcp-auth-bridge.ts` + host/index.ts 接线；**additive 契约增量已报备入 host-contract smoke Round G**）：
    - `bindExtensions({uiContext, mode:'rpc'})` 在会话工厂内对每个新会话执行一次——SDK 各 mode 同款路径，`session_start` 由此首次向扩展发出（TUI parity；adapter 由此初始化，eager server 语义同 TUI）。bridge context 镜像 SDK noOp context（select/confirm/editor 等全 no-op cancel 语义），仅 `notify`/`input` 在 **in-flight OAuth flow 期间** 转发——flow 外零行为变化。
    - `mcp_auth_start` → 守卫（命令已注册？adapter 未装 = 诚实 completed error，**不落成真 prompt**）→ `session.prompt('/mcp-auth <server>')`（扩展命令就地执行、不落用户条目——SDK 语义）；flow 完成 = `mcp_auth_completed{ok, notices}`，ok = 无 error 级 notice（adapter 三条终态路径全走 ui.notify）。
    - 手动兜底 = `mcp_auth_input_required{requestId,title}`（title 原文含授权 URL——adapter 的 OSC-8 终端超链接格式）→ 设置窗粘贴框 → `mcp_auth_input_resolve` 回填；signal abort/会话死亡 = pending resolve undefined，永挂死。**凭据零过桥**——桥只搬运提示与粘贴 URL，token 全程在 adapter/钥匙串。
  - **渲染**（`McpSection.tsx` + `mcp-auth-store.ts` + settings-model MCP 节 + PlugIcon + CSS）：双卡（Global/Project，胜出层 scope 分家）+ 每行胜出来源徽标（`.agents` 胜出标 read-only）+ N-layers 遮蔽徽标 + OAuth 徽标 + Disabled 徽标；行摘要点击展开有效配置 JSON（合并视图）；每层 open-config 入口（卡头层 chip + 行内 defined-in chip）；启停开关（写旗标）；增改删表单（transport 单选 + args/env 逐行 + oauth 勾选；edit 预填有效条目、未知字段往返保留）；删除确认 = 模型文案（文件路径 + 遮蔽语义）；`~/.agents` 胜出 = Edit/删除拒因 toast。OAuth Authenticate（oauth 行可见）→ store 驱动状态条 + 手动粘贴框（Enter/Complete/Cancel）；无聚焦会话 = 诚实报错。App 层把 mcp_auth_* 事件折入 store（chat reducer 防御性 no-op——非转录事件）。
  - **无头 OAuth 全链验证**（一次性脚本，机器锁屏期间的等价证据）：真实 host 进程 + 沙箱 agent 目录（真实 `~/.pi/agent/npm/node_modules` 符号链接 + `packages:["npm:pi-mcp-adapter"]` + PI_OFFLINE=1）+ 项目 .mcp.json 指向本地 mock OAuth 服务器（protected-resource/authorization-server 元数据、动态注册、authorize 302、token 双 grant、最小 streamable-HTTP MCP 端点供 reconnect）+ PATH 前置 `open` 记录 shim：**auto 腿全绿**——adapter 经 /mcp-auth 起流 → shim 记录授权 URL（外部打开断言等价物）→ shim 内 curl 完成浏览器腿 → callback 自动完成 → token 交换 → **凭据入库位=系统钥匙串 `pi-mcp-adapter.oauth`**（default store；smoke 场景用 `settings.oauthCredentialStore:"encrypted-file"` 落沙箱文件）→ `MCP: Reconnected to mock-oauth` **手动粘贴腿全绿**——shim 只记录不开浏览器 → 粘贴框出现 → 手动完成 authorize → 粘贴 callback URL → token → reconnect。**教训入 smoke**：粘贴标题含 OSC-8 转义（strip 后取 http 行）；mock /register 必须回 `redirect_uris`。
  - **host-contract smoke Round G**（ticket 89 报备，全绿）：真实 host + 真实 adapter 环境，`mcp_auth_start`（幽灵 server）→ `mcp_auth_notice`（adapter 自身 "not found" error 原文）→ `mcp_auth_completed(ok:false, notices 原文)`——start/notice/completed 三消息契约 + ok 启发式 + 零凭据过桥全断言。A–F 各轮回归全绿（bindExtensions 上线后旧载荷兼容验证通过）。
  - **electron smoke stage `settings_mcp` 已写入**（smoke.ts packages stage 之后）：沙箱 home（PICODE_MCP_HOME）+ 四层种子 + 外部 cursor/claude 配置字节基线 + 真实 adapter 符号链接 + PI_OFFLINE；断言链 = 双卡渲染/徽标/合并摘要/旗标启停（文件断言）/表单增改删落正确层（文件断言）/层入口标题/`PICODE_OAUTH_AUTOCOMPLETE` 两腿 OAuth（mock 服务器 + 记录 shim + encrypted-file 凭据）/外部配置字节不变/PiCode 持有文件零 token/钥匙串零条目。**未跑通的原因 = 机器锁屏**：ticket-44 真实剪贴板阶段要求 `document.hasFocus()`，锁屏下 macOS 对一切进程拒绝 frontmost（Activity Monitor 同样无法激活——系统级锁屏模态，与本工单代码无关；contract smoke 无窗阶段不受影响全绿）。**操作者解锁后重跑 `npm run smoke:electron` 即可验收**（阶段自含种子与清理）。
  - **vitest 1586/1586 + typecheck 双 tsconfig 清 + eslint 清**（主仓全 suite）；`ps` 自查已做（wt-88 smoke 并发窗口已等待避让）。
  - **操作者：解锁机器后 `npm run smoke:electron` 验收 stage；然后 `bash scripts/merge-ticket.sh 89`。**
- 2026-09-18 (/code-review 修复)：双轴评审（standards × spec 并行子代理）四条 P1 + 七条 P2 全部修复——
  - **spec P1-1**：smoke 种子语义修正——`pi-only` 同时定义于 pi-global 与 pi-project（{disabled:true}），按模型「最后定义层胜出」语义行属 **Project 卡**（断言从 Global 卡移正 + agents-server 补 Global 卡归属断言）；模型本身正确（= adapter 语义），是 stage 期望写反。
  - **spec P1-2**：disable 旗标文件断言从字符串匹配（`'"disabled": true'` 永不命中紧凑 JSON）改为解析对象断言。
  - **spec P1-3**：层入口断言从 `title === path` 改为 `title.includes(path)`（渲染为 `Open <path>…`）。
  - **spec P1-4**：凭据断言改为**默认钥匙串仓**（= 本票红线本形：adapter/系统钥匙串）——断言 `pi-mcp-adapter.oauth` 条目在流后存在 + PiCode 持有文件零 token + 流程前无钥匙串条目（基线）、流程后 stage 清理自产条目（mock token）；encrypted-file 变通整体退役（其根 = SDK agent dir 的 mcp-oauth-encrypted，MCP_OAUTH_DIR 沙箱不生效且 per-run key 跨跑不可解——上一跑的教训：陈旧 credentials.json 导致 decrypt 失败；stage 现清理本票自产的陈旧账号目录）。
  - **spec P2-5**：坏 JSON 的 toggle/add/edit/remove 从静默重写改为诚实拒绝（readRawDocOrThrow——adapter 同语义）。
  - **spec P2-6**：`formToServerEntry` http 分支保留显式 `auth:false`（仅去陈旧 `auth:"oauth"`）+ 两表驱动用例。
  - **standards P1**：CONTEXT.md 增 **MCP 节（MCP Section）** 词条（Packages 节同型：双卡/旗标语义/两目标/OAuth 桥/零凭据/外部只读，Avoid: 状态徽标=票96）。
  - **standards P2**：`McpServerRowView` 死类型删除；App.tsx 改用 `isMcpAuthEvent`；`LAYER_LABELS` 删除改用 `layer.label`；service 两处 `~/.agents` 拒因统一走 `mcpReadOnlyWinnerCopy`（漂移文案消失）；`mergedServersBelow` 改用纯模型 mergeMcpLayers（去掉自制 spread 合并）；splitPath/dirnamePath 重复暂留（skills-management 同源纯函数，提共享模块属跨票重构）。
  - 复验全绿：vitest 1588/1588、typecheck 双清、eslint 清、build 清、host-contract smoke A–G 全绿、无头 OAuth 双腿复验绿（钥匙串断言形）。electron stage 两跑进展：①–⑧ 全过（双卡/徽标/旗标/增改删/层入口），⑨ OAuth 腿深至 token 交换/重连（`MCP: Reconnected to mock-oauth`）——**剩余阻塞仍为机器锁屏**（锁屏/显示器休眠下 macOS 对一切进程拒绝 frontmost，ticket-44 焦点阶段先行失败；idle 窗口两次抢跑至 ⑨）。**操作者：解锁后 `npm run smoke:electron`（跑前 ps 自查），全绿即 `bash scripts/merge-ticket.sh 89`。**
- 2026-09-18 (electron smoke 全绿)：操作者解锁后全套 `npm run smoke:electron` **EXIT=0**（约 5 分钟，真实模型调用全走）。`settings_mcp` stage 十四断言全绿：双卡渲染/来源徽标/合并摘要（shared-search-bin --fast = global command + project args）/旗标启停（enable 摘旗 + disable 落旗，文件断言）/表单增改删落正确层（文件断言）/层入口标题/**OAuth 自动完成腿**（shim 记录授权 URL = 外部打开断言 + callback 自动完成 + token + `Reconnected to mock-oauth`）/手动粘贴腿（粘贴框出现 → 完成授权握手 → 粘贴 callback URL → 成功）/外部 host 配置字节不变/PiCode 持有文件零 token/钥匙串自产条目清理。修复链（评审后实跑暴露的三处）：①leg-2 被 adapter 内存 auth 缓存短路（leg-1 token 有效 → 无流无框）→ stage 开 `PI_MCP_ADAPTER_DISABLE_AUTH_CACHE=1` + 清钥匙串自产条目后再Authenticate；②open shim 的 autocomplete 开关从 env 改文件旗标（host fork 时 env 定格，中途改 env 永远到不了已运行的 host）；③stage 结尾 Escape 回工作区（settings 视图替换侧栏，下一票的行探测需要）。跑批中另遇的 ticket-44 焦点 / ticket-25 deny-reason / ticket-28 selection / ticket-45 scroll / ticket-51 fork 时序 flake 均为 t84 已记录的模型时序类，复跑即绿（与 MCP 域代码零交集）。**visual harness 新帧 `s7-settings-mcp.png`**（fake-settings 确定性 fixture：双卡/全徽标/OAuth 行/DISABLED 行/2 LAYERS 遮蔽/层 chips）。**操作者：`bash scripts/merge-ticket.sh 89`。**
- 2026-09-18 (merge session，per 操作者验收指令「89 工单已验收」)：Status 翻转 ready-for-human（验收框经 Comments 既有证据链勾选在案：实现 / code-review 四 P1+七 P2 全修复 / electron smoke 全套 EXIT=0 十四断言 / 两次 handoff 注记）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。CONTEXT.md「MCP 节（MCP Section）」词条已随票入册（评审 P1 项），合并时核对。
