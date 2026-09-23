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
- **Round 1 裁决（操作者 2026-09-24，五项全按推荐）**：
  - **Q1 = 三件齐升**：SDK 0.87.1 + pi-subagents 0.71.0 + pi-mcp-adapter 2.37.0 为本批目标态。
  - **Q2 = 全局 TUI 同步升**：全局 pi 同步升 0.87.1，维持 ADR-0005 零漂移（升级动作归操作者，票面管适配 + 会话格式兼容冒烟）。
  - **Q3 = 最小适配 + 新能力盘点留档**：现有功能面在新版下全绿；新版新能力不主动透出 UI，盘点留档、候选票归操作者裁决。
  - **Q4 = 单态以新版为主**：不双态兼容旧版用户级包；诚实地板检查机制保留并更新水位。
  - **Q5 = 断言/探针面纳入票面验收**：subagents 探针升位、smoke t134 地板断言、package.mjs 打包校验、subagent-sdk-alignment 地板常量随水位更新；契约事件增量照 additive 纪律报备。

## R0-调研 三路报告落地（2026-09-24，报告全存 `.scratch/picode-1-8-1/research/`）

- **报告**：`sdk-0.87.1-diff.md` / `pi-subagents-0.71.0-diff.md` / `pi-mcp-adapter-2.37.0-diff.md`（changelog 逐字 + .d.ts diff + tsc 双探针 + 逐文件 diff + file:line 证据索引；delegate 全程只读，/tmp 解包）。
- **SDK 0.87.1**：0.87.0 五条 Breaking（shouldStopAfterTurn 移除 / SessionEntry+context_edit / SessionManager canonical / TurnEndEvent 扩张+emit(turn_end) 禁用 / agent_settled 延迟）全部不触及 PiCode（rg 零命中或松类型兜底）；API 面 18 个 .d.ts 变化除 loadPromptTemplates（PiCode 不调用）外全为加法；prompt/steer/followUp/abort/navigateTree/fork 签名不变；AgentEvent/AgentSessionEvent 联合逐字一致。**唯一硬失败 = `tests/main/bundled-sdk-versions.test.ts:29-30` 写死 '0.86.1'**。会话格式 v3 不变（context_edit 仅错误重试/溢出恢复写入）；旧 TUI 开新会话不崩（唯一良性分歧：旧 TUI 续写含 context_edit 会话时被省略的失败尝试重回上下文——Q2 同步升后此分歧消解）。适配 = package.json:72 版本（S）+ 测试字面量（S）+ package.mjs:69,91 注释（S）+ 全量验证（M）。
- **pi-subagents 0.71.0**：**强制改动为零、零死亡面**——票 134 根因（review.js/permission-arbiter.js 的 pi-ai transcript-tools 硬导入）在 0.71.0 已整体删除（watchdog 改 initialState.systemPrompt，pi-agent-core 0.86.1 原生支持；changelog #2377 明言修复 0.86.1 布局）；RPC 七方法 handler 逐字节不变（仅新增 cost）；status.json 信封不变（steps 仅增量 externalProcess）；四生命周期事件名/payload 键不变（child-status 增 "started"，被 PiCode 过滤器忽略）；peer 地板恰 pi-ai >=0.86.1、无 0.87 硬门。**三个行为变化（非破坏）**：①dev/unpacked 动态激活开启（subagents_enable loader 先行，一次额外往返；asar 打包保持 eager+一条警告——票 111 的 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT override 语义下探针读到内嵌 SDK）；②打包 worker 默认 fresh 上下文（worker.md defaultContext: fork→fresh，per-call/全局 fork 仍可请求）；③async-started task/goal 脱敏（PiCode 不读）。可选项：cost RPC 桥接事件（S~M）、动态激活预激活（S~M）、child-status started 转发（S）、探针补 0.71 断言（S）。
- **pi-mcp-adapter 2.37.0**：**无硬死面**——mcp-status.ts/mcp-setup-panel.ts/server-manager.ts/OAuth 流/skills 全部字节未变；MCP_STATUS_SNAPSHOT_VERSION=1 与频道 pi-mcp-adapter/status/v1 未 bump（票 96 投影安全）；config.ts 合并规则逐行未变（仅外包 applySettingDefaults：settings.exposeResources 全局默认，server 自带者胜出）。两处软降级仅当用户启用新设置：①PiCode mergeMcpLayers 不读 settings 块 → exposeResources 全局默认不投影（显示保真缺口）；②deferWithMissingMetadata 延迟首快照（诚实降级已覆盖）。适配 = 两处 fidelity 注释升级（S）；可选 exposeResources 投影（S/M ~1 天）。新能力盘点：exposeResources 全局开关（S）、/mcp jev setup（M–L）、allowInstall/deferWithMissingMetadata（UI 价值低）。
- **升级次序无死锁**：0.71.0+SDK 0.86.1 已验证可行；0.71.0+SDK 0.87.1 可行（peer `>=0.86.1`/`*`）；adapter 2.37 peer 含 ^0.86 与 ^0.87。
- **本地事实补齐**：`smoke:subagents070` 不在 run-all.sh（独立脚本，更名零风险）；interop-smoke.ts 无版本字面量（import 捆绑 SDK + 读最新 TUI 会话，天然验证终态）；run-all.sh:68 electron smoke 已带 env -u 净化。
- **Round 2（Q6–Q10）已摆**：dev 动态激活处置 / 可选项入批与否 / 探针更名口径 / 环境升级时序 / 模型分派。答后回填。
- **Round 2 裁决（操作者 2026-09-24）**：
  - **Q6 = A 接受现状**：dev 形态动态激活零改动（打包 app 保持 eager；dev 往返为上游设计意图——省上下文）。
  - **Q7 = 待解释后决定**：四个可选项已向操作者解释（cost RPC 桥接 / started 转发 / exposeResources 投影 / jev setup UI），待裁决入批与否。
  - **Q8 = A 更名+补断言**：subagents-070-probe → subagents-071-probe + package.json 脚本 smoke:subagents070 → smoke:subagents071 + 补 0.71 断言（ping.capabilities.cost、steps[].externalProcess census）。
  - **Q9 = 先升环境、操作者亲为**：操作者在启动执行会话**之前**完成三件环境升级（`pi update` → 0.87.1；`pi update --extensions` → pi-subagents 0.71.0 / pi-mcp-adapter 2.37.0）。理由：执行会话自身跑在 pi 进程上，中途升级不热替换（扩展加载不热换、self 替换不热载）→ 会话自身机器滞留旧版，正是操作者要避免的重启场景。手册前置节 = 操作者先升环境再启动执行会话，执行会话零环境操作。
  - **Q10 = 模型分派（原话）**：思考强度使用 max；非多模态票的模型使用 bella-local 的 GLM-5.3；需要多模态的票使用 bella 的 GLM-5.3-flash。本批全票非多模态（依赖/桥/探针面，无 UI 帧）→ 全批 bella-local/GLM-5.3:max。事实核对：bella-local/GLM-5.3 在 ~/.pi/agent/models.json 在案。

## R0-Q7 细化轮（可选项逐项裁决 + 两问事实，2026-09-24）

- **Q7-② child-status "started" 转发 = 不入批、留盘点**（操作者定）。
- **Q7-④ /mcp jev setup UI = 不入批**；但操作者附加要求：「如果已经配置好了需要能在 ZCode 中使用」——**按 CONTEXT.md 术语理解为 PiCode**（ZCode 是外部参照物不承载 pi 扩展；若理解有误请操作者纠正）。事实核验（三段）：①**运行时自动可用**——jev 语义搜索跑在 adapter 扩展内，PiCode host 会话同样加载用户级 adapter，配置好后 PiCode 会话内自动生效，零 PiCode 改动；②**配置共存零破坏**——/mcp jev setup 把 settings.jev 写入 .pi/mcp.json（或全局等价物，adapter config.ts:1189+ writeJevSemanticSearchConfig）；PiCode 合并模型只读 mcpServers/mcp-servers 键（mcp-management.ts:195,213），settings 块被忽略不碍事；增改删写保留未知键（deriveServerEntryWrite/Remove「unknown keys preserved」）→ PiCode 编辑服务器不会抹掉 jev 配置；③唯一缺口与 exposeResources 同类：MCP 设置页不显示 jev 配置状态（settings 块不投影），不影响使用。**T148 加验收项：jev 已配置时 PiCode MCP 面正常 + 编辑写不丢 jev 块。**
- **Q7-① cost RPC 桥接（操作者问消费点，待终裁）**：事实——**用量统计页已经计入 subagent 开销**：UsageStore.listSessionFiles 递归 walk 全目录 depth<8 收全部 *.jsonl（src/main/usage/store.ts:62-80），子代理会话文件（sessions/<project>/<parent-id>/<child-uuid>/run-N/session.jsonl，三路调研 delegate 的 session 文件即此布局）的 usage 按 day×model 折入快照，ADR-0002 口径无死角。cost RPC 的差异化价值仅 **live 数据**（运行中当前会话 parent+children 即时花销、turn 边界可拉、unresolvedAsyncChildren 下界）——现有 UI 零消费点，需新 UI 设计才有意义。建议：**不入批**（历史统计已覆盖；live 消费是独立产品需求）。
- **Q7-③ exposeResources 投影（操作者问语义，待终裁）**：事实——MCP 服务器可暴露 tools（可调用函数）与 resources（可读数据对象：文件/文档/数据库行等）；adapter 默认把每个 resource 变成可调用的「资源工具」（README "Expose MCP resources as tools (default: true)"，生成名如 read_figjam）。settings.exposeResources: false = 全局不再把任何服务器的 resources 变成工具；**每服务器自带的 exposeResources 条目胜过全局默认**（README "Per-server exposeResources overrides this"）。操作者当前未设此键 → 全局默认 true，PiCode 显示与运行时零差异。建议：**不入批**。
- **Q9 升级委托改向（操作者 2026-09-24）**：「在你给出执行 prompt 之后你帮我升级」——intake 交付执行 prompt 后由 intake 执行环境升级（pi update → self 0.87.1；pi update --extensions → pi-subagents 0.71.0 / pi-mcp-adapter 2.37.0）+ 验证版本 + 报告；intake 自身进程不热替换无碍（升级后不再派工）。操作者随后启动执行会话——环境已是终态，零重启场景。
- **Q7 终裁（操作者 2026-09-24）**：①cost RPC 桥接 = **不接入**（用量页已计入 subagent 花销，live 消费是独立产品需求）；③exposeResources 投影 = **不接入**（未启用该设置，零差异）。四项可选项（cost 桥接 / started 转发 / exposeResources 投影 / jev setup UI）全部不入批、留盘点（research 报告盘点节，候选票归操作者）。

## 定稿（前沿树空）

- 裁决链完整：R0 转向（三件齐升）→ Round 1（Q1–Q5）→ Round 2（Q6–Q10）→ Q7 细化轮（①–④）。无未决问题。
- 产出：spec（R0–R3 ↔ 票 144/146/147/148）+ Linear 镜像（146/147/148 新建 Todo，144=LIA-205 已在）+ session-prompts 手册 + 主执行 Agent prompt；随后 intake 执行环境升级。
- 本批定桂：零 shared-contract 增量、无新术语、无 ADR 变更、无多模态票、无参照帧；模型分派 = 全批 bella-local/GLM-5.3:max。

## Q0（开工第一问）：微票 144 处置 —— **A：并入 1.8.1**

- **问题**：微票 144（forkHost 环境标记剥离——`scripts/smoke/host-contract-smoke.mjs:408-415` 直 fork host 时不剥 `PI_SUBAGENT_CHILD`/`PI_SUBAGENTS_HERDR_BRIDGE`；从 subagent 会话驱动的 smoke:host 死 Round K，票 143 实现工实证、`env -u` 三变量后全套过；Linear LIA-205 Todo）仍待派。
- **裁决（操作者 2026-09-24，答「A」）**：**并入 1.8.1 批次**——harness 微票入 1.8.1 波次表（纯 scripts/smoke 面改动，不阻塞任何票），编号沿用 144 不新开；票文件留原地 `.scratch/picode-1-8/issues/144-forkhost-env-strip.md`（merge-gate 已覆盖 picode-1-8 目录，零移票必要）。
- **镜像记录**：LIA-205 描述追加变更记录 + `addLabels: iter:1.8.1`（iter:1.8 保留为立项来源标记）；状态维持 Todo 待波次派工。
- **落库**：票面新增 `## Comments` 裁决记录；本文件 Q0 节即全量账。
