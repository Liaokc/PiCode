# PiCode 1.5 追加需求取证记录：MCP / 插件 / 技能本地管理（grill 前侦察）

Status: resolved（Q1–Q11 已拍板，见下节；票 63/64/65 已发布）

2026-09-11 需求收集会话产出。操作者报新需求：**MCP、插件（plugin）、技能（skill）的本地管理**——PiCode 只做本地管理，不做 ZCode 式插件市场；借鉴本机 cc-switch（v3.20.2）的多 agent 管理模式。约束：v1.5.0 已开工（54/55 在执行），新票不得扰动 54–62 既定安排。本文件是 grilling 的取证输入；全程只读（ZCode bundle 提取用后即弃、cc-switch/ZCode/Pi 数据零写入）。

## 三方现状（实机证据）

### Pi 本体（PiCode 的大脑——决定"能管什么"）

- **MCP：Pi 明确不支持**。pi 官方文档 Design Principles 原文：*"It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash. You can build or install those workflows as extensions or packages"*（usage.md:309）。SDK dist 内无 MCP client 实现（唯一的 mcpServers 命中是 @google/genai 库的无关代码）。**PiCode 要"管 MCP"只能管 Pi 之外的配置文件（如 ~/.agents/mcp.json 这类跨 agent 约定），Pi 本身不会消费它**——这是本票最大的语义分叉点。
- **插件 = pi packages**（`pi install npm:…/git:…/本地路径`；`pi remove`；`pi list`；`pi update`）。落点：`~/.pi/agent/settings.json` 的 `packages` 数组（操作者当前为空）；资源四类 = extensions/skills/prompts/themes。扩展另有本地路径形态：`extensions: string[]`（操作者现有 3 个 .ts：bash-guard/cost-widget/herdr-agent-state）。
- **技能**：`skills: string[]` 路径数组（支持 glob/排除）+ `enableSkillCommands`；per-resource 启停走 `pi config` TUI（读写 settings.json）。PiCode 现已**只读**消费技能清单（票 38 会话内菜单 / 票 52 空态命令目录，probe resourceLoader 枚举）。
- settings.json 结构：全局 `~/.pi/agent/settings.json` + 项目 `.pi/settings.json`（信任门控）。

### ZCode（对照物——三段设置面）

- **三段设置**：settings 内 MCP 服务器 / 技能 / 插件 三节 + quickPick 入口（"MCP 服务器""技能"）。i18n 全表已取证（约 200 条键值，用后即弃）。
- **MCP**：配置文件 = `~/.agents/mcp.json`（跨 agent 约定目录，键 `mcpServers`；本机该文件不存在=ZCode 未配）+ 旧版 mcp-storage 迁移；表单 = stdio/SSE 两型（name/type/command/args/env/headers/timeoutMs/protocolVersion auto|legacy|v2）；状态机 = connecting/connected/disconnected + 失败原因分类（config_invalid/runtime_unavailable/process_start_failed/network_unreachable/connection_timeout/protocol_negotiation_failed/…约 20 种）；**"从外部 Agent 导入"**（扫描 Claude Code/Codex/OpenCode 等的 MCP 配置，只导缺失项）；Plugin 提供的 MCP 单独分组（插件内置/宿主内置/需授权等状态）。**remoteSync（SSH 远端同步）是 ZCode 特色，与 PiCode 无关**。
- **技能**：来源分组 = 工作区与个人 / Plugin 技能；启用状态筛选；详情（描述/路径/范围/版本/slug）；诊断面板（skill_root_not_found/skill_missing_frontmatter/skill_invalid_name/skill_duplicate_name 等 12 种诊断码）；删除（确认框，从磁盘移除技能目录）；新建（走 agent 会话）；**从外部 Agent 导入**（扫描 Claude Code/Codex/OpenCode 的 skills 目录；copy/symlink 两种导入方式）；"复制到通用目录/从通用目录移除"（~/.agents/skills 通用层）。
- **插件**：已安装 tab + 发现 tab（**插件市场**——官方市场 + 自定义市场源 GitHub 仓库/Git URL/本地目录；分类/搜索/安装/更新/卸载/检查更新）；per-插件启停（User 默认 vs 工作区覆盖）；插件可打包技能/命令/Hooks/MCP 服务器（详情页组件清单）；配置（密钥存取）。**操作者明确：市场不做**。
- 落点：`~/.zcode/cli/config.json` 的 `enabledPlugins`（本机 `superpowers@zcode-plugins-official: true`）；插件清单 `.zcode-plugin/.claude-plugin/.codex-plugin plugin.json` 三形态（兼容 Claude Code 插件导入）。

### cc-switch v3.20.2（借鉴物——多 agent SSOT + 按 agent 启停）

- 本机数据（只读查询）：`~/.cc-switch/cc-switch.db` 表 = providers / **mcp_servers** / **skills + skill_repos** / prompts / profiles / proxy 系列。
- **skills SSOT 模式**：`~/.cc-switch/skills/`（58 个实目录 = SSOT 本体）← skill_repos 从 GitHub 仓库安装（anthropics/skills、ComposioHQ/awesome-claude-skills、cexll/myclaude）→ 按 agent 启停列（enabled_claude/codex/gemini/opencode/hermes/grokbuild——**无 pi 列**）软链到各 agent 的 skills 目录。本机软链图实测：`~/.claude/skills` = 39→`~/.agents/skills` + 12→`~/.cc-switch/skills`；`~/.agents/skills`（53 实目录）= 另一 SSOT（手工/历史层）；`~/.zcode/skills` 54 软链 → `.claude`/`.agents`；`~/.pi/agent/skills` 37 全软链 → `~/.agents/skills`（PiCode 的技能目录已是链接形态！）。即操作者的技能真身分散在 `~/.agents/skills` 与 `~/.cc-switch/skills` 两个 SSOT，各 agent 目录多为链接。
- **MCP SSOT 模式**：mcp_servers 表（server_config JSON + 每 agent enabled 列——同样无 pi）；本机 2 条（computer-use、node_repl，均 ChatGPT/CUA 相关）。
- **Pi 支持**：binary 内含 `@earendil-works/pi-coding-agent`、`PI_CODING_AGENT_DIR`、"Pi Skills"、"Pi provider configuration"——cc-switch 对 pi 已有 provider 切换（models.json）与 sessions 管理；skills 的 per-agent 启停列尚无 pi（SSOT 迁移中，`skills_ssot_migration` 字样）。

## Grilling 决议（2026-09-11，Q1–Q11 全部拍板）

- **Q1 = MCP 出局**：Pi 不消费 MCP（usage.md:309 明文），就不管理——“管理面与 Pi 消费面严格一致”。cc-switch 式跨 agent MCP 管理不做。
- **Q2 = C（全套 + 项目级）**：packages 管理 = 列表/安装（npm:/git:/本地）/移除/启停（读写 settings.json packages 数组）+ 项目级（.pi/settings.json）。信任门实测（SDK resolveProjectTrusted）：有保存决策走决策；无决策 SDK host 静默不信任（安全默认）；受信任项目缺失包会话创建时自动安装——PiCode 写配置、Pi 裁决加载，不越权。
- **Q3 = A**：技能 = 列表 + per-技能启停 + 打开所在目录 + 删除（**只删 ~/.pi/agent/skills 下的链接/条目，软链真身永不碰**）；新建/编辑出局。
- **Q4 = A**：新建设置窗——标题栏齿轮 + ⌘,；窗口内左侧节导航（Skills / Packages），结构可扩展。PiCode 第一个设置面。
- **Q5 = 折中**：技能新增/删除落 `~/.agents/skills`（中立约定目录，Pi 官方认 .agents/skills）；cc-switch.db 绝不读写；启停写 Pi 自己的 settings，不动软链。
- **Q6 = A**：票 63+ 入 `.scratch/picode-1-5/issues/`（全局编号连续，merge 脚本已含 1-5）；是否赶 v1.5.0 发布由操作者发布时定，票不阻塞 54–62（零文件交集）。
- **Q7 = A（两票）**：63 = 设置窗基座 + 技能管理；64 = 包管理（全局 + 项目级 + 信任态），64 blocked by 63（同窗口文件）。
- **Q8 = A**：UI 叫 **Packages**（Pi 本体词汇；ZCode 的 plugin 语义绑死其市场体系，PiCode 不做市场不借用）。
- **Q9 = A**：入口 = 标题栏齿轮 + ⌘,；节导航可扩展。
- **Q10 = A**：技能列表以 Pi 实际加载面为准（settings skills 路径展开含软链 + packages 提供的 + 受信任项目技能——probe resourceLoader 枚举扩展，每行标来源）；删除仅删 ~/.pi/agent/skills 条目本身。
- **Q11 = A**：项目节只读展示信任态（读 trust.json：trusted / untrusted 含 ask-无决策派生态）；信任决策留给 Pi /trust。

### 追加痛点（同日）：Usage 图表三项（票 65）

操作者报：① 30 天趋势曲线向下超出基准线（“还是”——查实为 **1.3 批 R11 既定决议未交付**：spec.md:37/110 写明钳制 + hover 形态与测试计划，/to-tickets 时 R11 未落任何票，charts.ts 自 1.0 票 12 后零改动）；② 7 天与 30 天曲线风格不一（同算法点密度差异 + 过冲放大）；③ 趋势图/圆环悬浮无信息。根因：smoothPath Catmull-Rom 控制点越界基线（charts.ts:222，1.3 grilling:103 同款根因）；TrendChart 仅 onClick、DonutChart 无 hover。对齐锚点 = z13-usage-trend-hover / z13-usage-donut-hover（趋势 hover = 日期 + 合计 + 分模型行 + 交点圆点；圆环 hover = 模型 + tokens + 占比；ZCode 曲线从不破底）。归类：缺陷（1.3 spec 交付缺口）+ 对齐。

## 语义分叉点（grilling 要拍的——已全部裁决，存档备查）

1. **MCP 管什么**：Pi 不消费 MCP。PiCode 管 MCP = 管一个 Pi 之外的配置文件（~/.agents/mcp.json 或自有位置），供其他 agent（Claude Code/Codex）使用 + 未来 Pi 若支持可直接复用——还是本票只管 Pi 消费的东西（MCP 出局）？
2. **"插件"对 Pi = pi packages**：管理 = 列表/安装（npm/git/本地）/移除/更新/启停——是否包含写 settings.json packages 数组？项目级（.pi/settings.json）要不要？
3. **技能管理深度**：只读列表（已有）→ 管理的最小增量是什么？（启停 / 删除 / 打开目录 / 新建？）软链技能（本机 37/37 是软链）删除语义 = 删链接还是删真身？
4. **UI 落点**：ZCode 是 settings 窗口三节 + quickPick 入口；PiCode 现无 settings 窗口——落点待拍。
5. **批次归置**：v1.5.0 已开工（54/55 执行中）——新票入 `.scratch/picode-1-5/issues/` 编号 63+（全局连续，merge 脚本已含 1-5），还是开 picode-1-6 批次？版本归 v1.5.0 还是顺延 v1.6？
