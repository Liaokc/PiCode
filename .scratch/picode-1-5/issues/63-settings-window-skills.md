# 63: 设置窗基座 + 技能管理（Skills 节）

**What to build:** PiCode 第一个**设置窗**（Settings Window）：标题栏齿轮钮 + **⌘,** 全局快捷键打开；窗口内左侧节导航（Skills / Packages，结构可扩展——Q9 拍板 A）。本票交付 **Skills 节**：技能列表**以 Pi 实际加载面为准**（settings `skills` 路径数组展开含软链 + packages 提供的技能 + 受信任项目技能——probe resourceLoader 枚举扩展，票 52 基建；每行标来源：user dir / package / project，Q10 拍板 A）；每行**per-技能启停**（写 Pi settings 的 skills glob 排除 / 包条目增量——与 `pi config` 同格式）；**打开所在目录**；**删除仅删 `~/.pi/agent/skills` 下的链接/条目本身**——软链真身（~/.agents/skills、~/.cc-switch/skills）永不碰（Q3 拍板 A 底线）；包内技能不可删、随包启停。新建/编辑技能不做。全英文文案。

**背景（取证）：** Pi 技能消费面 = settings `skills: string[]`（glob/排除语法）+ `enableSkillCommands`；per-资源启停 = `pi config` 写 settings 的包条目增量数组（docs/settings.md + packages.md）。操作者本机：`~/.pi/agent/skills` 37 项**全为软链**（→ `~/.agents/skills` 53 实目录 SSOT；`~/.cc-switch/skills` 58 实目录为另一 SSOT）——删链接不删真身是数据安全底线。PiCode 现状：技能清单只读消费（票 38/52 probe）。cc-switch 借鉴 = SSOT 列表 + 按 agent/来源启停的心智（Q5：新增/删除落 `~/.agents/skills` 中立目录；cc-switch.db 绝不读写）。UI 词汇：Skills（Q8 相关拍板 A 的同族——Pi 本体词汇）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 设置窗：标题栏齿轮钮 + ⌘, 打开/关闭（Esc 亦关）；左侧节导航（Skills / Packages 两节，Packages 节由 64 交付——本票留导航占位）；窗口无模态、不影响主窗会话
- [ ] 技能枚举扩展：probe 报告增技能来源维度（user dir / package / project + 所在路径；additive 报备）；列表以 Pi 实际加载面为准
- [ ] per-技能启停：写 settings（skills glob 排除 / 包条目增量，与 `pi config` 同格式）；启停状态如实回显
- [ ] 打开所在目录（Finder reveal）；删除 = 仅删 ~/.pi/agent/skills 下的链接/条目，真身零触碰（表驱动断言）
- [ ] 包内技能不可删（删除钮不出现）；行来源徽标
- [ ] Seam-1 表驱动：技能列表投影（来源/路径/启停维度）+ 启停写回的 settings 变更推导
- [ ] electron smoke：设置窗开合（⌘,）+ 技能列表 + 启停 + 删链接保真身
- [ ] visual harness：设置窗 Skills 节帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 63`。

## Comments

- 2026-09-11 (requirements intake): 建票（mgmt 追加需求，Q3=Q4=Q9=Q10=A）。波次：独立链（与 54–62 零文件交集），可即刻开工。**64 blocked by 本票**（同窗口文件）。术语 rider：「设置窗（Settings Window）」入 CONTEXT.md。契约增量：probe 报告技能来源维度（additive，实施时报备）。
- 2026-09-11 (release scope): 操作者拍板「全部赶 v1.5.0」——本票纳入 v1.5.0 发布范围，与 54–62 同批验收。
