# 52: 空态命令目录——probe 扩展 resourceLoader 枚举 + New Task 菜单通供

**What to build:** New Task 空态敲 `/` 列出**真实命令**（prompt 模板 + 技能；无 /compact、无退役六条——Q1/Q9 拍板）。数据源：auth-probe 短命 host 进程扩展 **resourceLoader 枚举**（无会话机制，ZCode appSlashCommands 应用级清单同型先例），probe 增 **cwd 参数**；main 层按 New Task 所选目录**防抖重探**并缓存（同目录一次）。空态点选命令 = **插入命令文本进 composer**（与 in-session 交互一致，Q3 拍板），首条消息送达时由 SDK 解析——不直接发送。菜单搜索/↑↓ 导航沿用现组件。

**背景（取证）：** 现状空态 chat 由 initialChatState() 展开，slashCommands 恒空——slash_commands 事件仅活 host announce 时发送（截图 pi14-empty-slash-menu "No matching commands"）；空态四 chips 为硬编码装饰非真实数据；probe 现状只起 ModelRuntime（无 resourceLoader、无 cwd）。

**Blocked by:** 48（resourceLoader API 以 0.85.1 为基准）、51（contract 与 host 文件邻接区双写者禁令——人为串行边，Q-B 确认）。

**Status:** ready-for-agent

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
