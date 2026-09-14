# 67: Skills 节双卡展示（全局技能 / 项目技能，按项目分组 + 双搜索入口）

**What to build:** 设置窗 Skills 节的展示结构修订（操作者 2026-09-14 两轮拍板）：① 由票 63 的单卡单列表改为 **「Global skills / Project skills」双卡**，对齐票 64 Packages 节形态；② **Project 卡按项目分组**——跨会话索引中所有已知项目枚举各自的项目技能（scope=project），每组一个项目（组头 = 项目名 + 路径 + trust chip），空项目组折叠为一行汇总；③ **两个搜索入口**——技能搜索（节顶部一个框，子串大小写不敏感过滤两卡全部行：名称/描述/路径）+ 项目搜索（Project 卡工具栏内，按项目名/路径过滤组）。切分与分组是**纯展示投影**——按行的 `scope` 字段分卡，probe 数据契约零改动（SkillsReport 仅 additive 增可选 `trust`——probe 已计算，service 透传，供组头诚实标注）。行内来源徽标（USER/PACKAGE/PROJECT）、per-技能启停（pi-config 格式）、打开所在目录、删除（仅 ~/.pi/agent/skills 条目、真身零触碰）、失效软链标注全部保留。「Pi 实际加载面为准」语义不变。

**背景（取证）：** 操作者真实会话库有 59 个项目目录（绝大多数是 PiCode 历史 worktree，无 .pi）——全量自动探测不可行；main 侧派生项目清单时用 `hasProjectTrustResources`（shared 纯谓词，fs 注入）**预筛候选**（cwd/.pi 下 trust-requiring 条目或祖先 .agents/skills 存在），只探测真实候选（预计个位数）；探测复用现有 listSkills IPC（main 按 cwd 缓存）。多项目探测渐进渲染（4 并发批次）。全局卡 = cwd=null 全局面（用户目录 + 包提供，scope≠project 行）；包提供的技能是 user 作用域 → 归全局卡（带 PACKAGE 徽标）。

**Blocked by:** 64（分支 t67 叠于 t64 之上——复用 64 的双卡样式与 PackagesSection 模式；合并顺序必须 64 → 67）。

**Status:** ready-for-human

- [ ] shared 纯投影：`partitionSkillRows(rows) → { global, project }` + `filterSkillRows(rows, query)`（名称/描述/路径子串）+ `projectListFromSummaries(summaries)`（去重 cwd → {cwd,name,sessionCount,latest}）+ SkillsReport additive 可选 `trust`（守卫兼容旧载荷）——表驱动测试
- [ ] main：`settings:projects` IPC（additive）——SessionIndexService 派生 + hasProjectTrustResources 预筛（fs 注入）；fake 分支 fixture（visual 帧）；SkillsService 透传 report.projectTrust → SkillsReport.trust
- [ ] SkillsSection 双卡 + 项目分组 + 渐进探测（4 并发批次，main 缓存）+ 组头（项目名/路径/count/trust chip/Focused 标）+ 空组折叠汇总；两个搜索入口（节顶部技能搜索框 + Project 卡项目搜索框）
- [ ] 卡头三件套通用化：.packages-card-header/-title/-file-note → .settings-card-head/-title/-note，Packages/Skills 两节共用
- [ ] visual fixture：fakeSkillsReport 按 cwd 分形状 + fakeProjectsList；visual-settings s5 帧注释更新
- [ ] electron smoke ticket-63 阶段回归绿（行选择器按 data-skill-name 查询不受分卡影响；沙箱候选项目探测次数受预筛约束）；跑前 ps 复核
- [ ] typecheck / lint / vitest 全绿；visual s5/s6 帧重拍比对
- [ ] code-review 双轴通过；提交当前分支（不自行 merge——**合并顺序 64 → 67**）

## Comments

- 2026-09-14 (done): 全验收项通过，提交 **149a5d6**（分支 t67-skills-section-split，叠于 t64 的 4220a93 之上，未自行 merge——**合并顺序必须 64 → 67**，请操作者/合并会话先执行 `bash scripts/merge-ticket.sh 64` 再执行 `bash scripts/merge-ticket.sh 67`）。
  - Gates：typecheck 双 tsconfig 绿；eslint 0 error（1 条 pre-existing warning）；vitest **1313 全绿**（+9：partitionSkillRows / filterSkillRows / projectListFromSummaries / filterKnownProjects / SkillsReport.trust 守卫）；visual s5 帧重拍（双卡 + 双搜索框 + api 项目组 TRUSTED chip）；electron smoke 全绿（63 阶段沙箱行在 Global 卡断言 + 64 阶段不受扰 + 零孤儿 host）；跑前 ps 复核每轮执行。
  - **Additive 报备**：SkillsReport 增可选 `trust`（probe 已算的 projectTrust 透传，旧载荷照常过守卫）；新 IPC `settings:projects`（SessionIndexService 派生 + hasProjectTrustResources fs 预筛——真实库 59 个项目只剩真实候选）；preload/env.d.ts 桥增 listProjects。卡头三件套 .packages-card-header/-title/-file-note 通用化为 .settings-card-head/-title/-note（Packages/Skills 共用）。
  - **顺带修复（票 63 潜伏 bug）**：probe-runner 在 cwd 为空时少传占位——agentDir 参数错位到 cwd 槽，probe 静默用了真实 agent dir。此前所有调用方都传非空 cwd 从未触发；67 的 Global 卡固定探测 null 面首次踩中（冒烟诊断抓到：Global 卡渲染了操作者真实 69 技能而非沙箱行）。修复：cwd 槽恒占位空串，host 端回退 home。
  - 设计落点记录：默认不自动扫全 59 项目（fs 预筛后逐候选探测，4 并发批次渐进渲染）；空项目组折叠为汇总行；技能搜索 = 节顶部一框过滤两卡行，项目搜索 = Project 卡内过滤组；untrusted 项目组头 Not trusted chip（行仍可见，供管理）。
  - 冒烟环境备注：hover/焦点类阶段（35/44/46）对机器占用敏感，本轮多次失败重试后全绿，失败点每轮不同，与本票改动无关。
- 2026-09-14 (claim): 操作者拍板「分为全局技能和项目技能进行展示」。实施会话认领（worktree wt-67-skills-section-split / 分支 t67-skills-section-split，叠于 t64 的 4220a93 之上）。开工前 ps 复核：无其他 PiCode Electron/dev-app/smoke 进程在跑。
