# 52: 空态命令目录——probe 扩展 resourceLoader 枚举 + New Task 菜单通供

**What to build:** New Task 空态敲 `/` 列出**真实命令**（prompt 模板 + 技能；无 /compact、无退役六条——Q1/Q9 拍板）。数据源：auth-probe 短命 host 进程扩展 **resourceLoader 枚举**（无会话机制，ZCode appSlashCommands 应用级清单同型先例），probe 增 **cwd 参数**；main 层按 New Task 所选目录**防抖重探**并缓存（同目录一次）。空态点选命令 = **插入命令文本进 composer**（与 in-session 交互一致，Q3 拍板），首条消息送达时由 SDK 解析——不直接发送。菜单搜索/↑↓ 导航沿用现组件。

**背景（取证）：** 现状空态 chat 由 initialChatState() 展开，slashCommands 恒空——slash_commands 事件仅活 host announce 时发送（截图 pi14-empty-slash-menu "No matching commands"）；空态四 chips 为硬编码装饰非真实数据；probe 现状只起 ModelRuntime（无 resourceLoader、无 cwd）。

**Blocked by:** 48（resourceLoader API 以 0.85.1 为基准）、51（contract 与 host 文件邻接区双写者禁令——人为串行边，Q-B 确认）。

**Status:** ready-for-human

- [ ] probe 报告增命令目录字段（additive 报备、旧载荷校验不破）；cwd 参数化；同目录防抖/缓存
- [ ] 空态 `/` 菜单列真实模板+技能（与会话内核对一致）；/compact 与退役六条不在列
- [ ] 点选 → 命令文本插入 composer（不直接发送、零垃圾回合）；搜索/键盘导航不回归
- [ ] 切换 New Task 目录 → 菜单随目录更新（electron smoke 断言项目级技能出现/消失）
- [ ] 无模板无技能时菜单如实为空（不崩，底纹提示语沿用现空态样式）
- [ ] 目录投影纯函数表驱动（Seam-1：probe 报告 → 菜单行，含 cwd 维度与排除规则）
- [ ] electron smoke 全链；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (baseline from 48 recon, 0.84.3→0.85.1)：本票实施所踩 SDK 面在 0.85.1 下零漂移——① resourceLoader.getPrompts/getSkills 形状不变（core/resource-loader.d.ts 逐字节相同，Skill 接口不变）；② ModelRuntime.create() 与 createAgentSessionServices({cwd, resourceLoaderOptions}) 签名不变 → probe 扩展 resourceLoader 枚举 + cwd 参数化路线在 0.85.1 下成立；③ auth-probe 思考档位镜像逐字节验证仍成立（EXTENDED_THINKING_LEVELS 不变）；④ 实验性 ./client 子路径改 source-only——本票只走根入口与既有资源 loader 面，不受影响。
- 2026-09-09 (requirements intake): 建票（spec R1，Q1a/Q2a/Q3a）。与 51 的串行边为人为稳妥（非硬依赖），51 合入即开。波次：W2→W3（48、51 之后）。
- 2026-09-10 (implementation, commit 197a81d): 实现完成，code-review 双轴通过。① **Additive 契约增量报备**：auth-probe 报告增 `commands?: CommandCatalogRow[]` 字段（prompt/skill 原始行：name/description/argumentHint?/source）——isAuthProbeReport 对旧载荷（字段缺席）照旧通过，在场时逐行校验（source ∈ prompt|skill）；probe host 增 cwd 参数（argv[3]，缺席回退 homedir = 仅全局资源）；新增 PiCode 内部 IPC 通道 `chat:new-task-cwd`（renderer→main fire-and-forget）与 `chat:command-catalog`（main→renderer push，每目录一份 NewTaskCommandCatalog）——均为 additive 新成员，chat 契约流（ParentToHost/HostToParent）零改动。② probe 扩展走 `createAgentSessionServices({cwd})`（0.85.1，48 recon 拍板路线）——真实会话同厂，resource loader 所见与会话内菜单逐字节同源；实测 argon Hint：YAML frontmatter `argument-hint: [env]` 解析为数组，投影时按会话内同型 stringify（guard 逐行验出，单元测试覆盖）。③ main 层 CommandCatalogService：300ms trailing 防抖、每目录恰好一次探测（缓存含错误载荷）、同目录并发合并、永不 throw。④ Seam-1：shared/new-task-commands.ts（selectCommandCatalog 选 cwd 维度 + projectCommandMenu 排除规则：/compact + 退役六条按名剔除 prompt 行，skill 行 `/skill:` 命名空间不冲突故全保留）——表驱动测试四族全绿（1106/1106，typecheck/lint 绿）。⑤ electron smoke ticket-52 段（尾部，51 之后）：种子项目模板+技能经真实链路（芯片下拉 recents → 选择上报 → 探测 → push → `/` 菜单）断言——rows 出现、/compact 与退役六条不在列、点选仅插入零 user_message、切目录后种子行消失；**注意事项**：本 worktree 所在运行环境无法通过 ticket-44 真实剪贴板的焦点门（macOS 15 在用户正与 agent 会话交互时拒绝 focus steal——stage 注释已记载，最小 Electron 探针复证 20s 永不获焦），故以「临时把 52 段移至 44 段之前跑完整 smoke（52 段五个断言全绿），随后恢复正式尾部顺序（本提交所含）」完成验证；操作者请在本会话空闲时（或普通交互终端里）跑一次 `npm run smoke:electron` 复核全链。不自行 merge——请操作者 `bash scripts/merge-ticket.sh 52`。
