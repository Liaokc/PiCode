# 63: 设置窗基座 + 技能管理（Skills 节）

**What to build:** PiCode 第一个**设置窗**（Settings Window）：标题栏齿轮钮 + **⌘,** 全局快捷键打开；窗口内左侧节导航（Skills / Packages，结构可扩展——Q9 拍板 A）。本票交付 **Skills 节**：技能列表**以 Pi 实际加载面为准**（settings `skills` 路径数组展开含软链 + packages 提供的技能 + 受信任项目技能——probe resourceLoader 枚举扩展，票 52 基建；每行标来源：user dir / package / project，Q10 拍板 A）；每行**per-技能启停**（写 Pi settings 的 skills glob 排除 / 包条目增量——与 `pi config` 同格式）；**打开所在目录**；**删除仅删 `~/.pi/agent/skills` 下的链接/条目本身**——软链真身（~/.agents/skills、~/.cc-switch/skills）永不碰（Q3 拍板 A 底线）；包内技能不可删、随包启停。新建/编辑技能不做。全英文文案。

**背景（取证）：** Pi 技能消费面 = settings `skills: string[]`（glob/排除语法）+ `enableSkillCommands`；per-资源启停 = `pi config` 写 settings 的包条目增量数组（docs/settings.md + packages.md）。操作者本机：`~/.pi/agent/skills` 37 项**全为软链**（→ `~/.agents/skills` 53 实目录 SSOT；`~/.cc-switch/skills` 58 实目录为另一 SSOT）——删链接不删真身是数据安全底线。PiCode 现状：技能清单只读消费（票 38/52 probe）。cc-switch 借鉴 = SSOT 列表 + 按 agent/来源启停的心智（Q5：新增/删除落 `~/.agents/skills` 中立目录；cc-switch.db 绝不读写）。UI 词汇：Skills（Q8 相关拍板 A 的同族——Pi 本体词汇）。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] 设置窗：标题栏齿轮钮 + ⌘, 打开/关闭（Esc 亦关）；左侧节导航（Skills / Packages 两节，Packages 节由 64 交付——本票留导航占位）；窗口无模态、不影响主窗会话
- [ ] 技能枚举扩展：probe 报告增技能来源维度（user dir / package / project + 所在路径；additive 报备）；列表以 Pi 实际加载面为准
- [ ] per-技能启停：写 settings（skills glob 排除 / 包条目增量，与 `pi config` 同格式）；启停状态如实回显
- [ ] 打开所在目录（Finder reveal）；删除 = 仅删 ~/.pi/agent/skills 下的链接/条目，真身零触碰（表驱动断言）
- [ ] 删除确认文案按类型分流：软链型 =「仅移除链接，真身目录保留（XX）」；实目录型 =「目录将从磁盘移除，无法撤销」（ZCode 同款确认语义）；实现 lstat 判型——软链 unlink 本身，绝不递归进真身（rm -rf 尾斜杠陷阱的表驱动断言）；悬链（真身已删）在列表中标注失效不静默消失
- [ ] 包内技能不可删（删除钮不出现）；行来源徽标
- [ ] Seam-1 表驱动：技能列表投影（来源/路径/启停维度）+ 启停写回的 settings 变更推导
- [ ] electron smoke：设置窗开合（⌘,）+ 技能列表 + 启停 + 删链接保真身
- [ ] visual harness：设置窗 Skills 节帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 63`。

## Comments

- 2026-09-11 (claim): 实施会话认领（worktree wt-63-settings-window-skills / 分支 t63-settings-window-skills）。开工前 ps 复核：无其他 PiCode Electron/dev-app/smoke 进程在跑（仅无关应用 ZCode/Postman/ChatGPT）。
- 2026-09-11 (done): 全验收项通过，提交 **407a79c**（分支 t63-settings-window-skills，未自行 merge——请操作者/合并会话执行 `bash scripts/merge-ticket.sh 63`）。
  - Gates：typecheck 双 tsconfig 绿；eslint 0 error（EmptyState 1 条 pre-existing warning，非本票）；vitest 1244 全绿（新增 4 文件 55 测试：Seam-1 skills-management 32 / pi-settings-editor 14 / skills-service 9）；electron smoke 全绿（含 ticket-63 stage：⌘, 开合 / 齿轮 toggle / 技能列表真枚举 / 启停写 sandbox settings.json ±pattern / 删链接保真身字节级 / Esc 关）；visual 2 帧（s5-settings-skills / s6-settings-packages，对照 .scratch/visual）。
  - Additive 报备：AuthProbeReport 增 skills/skillsError/skillsScannedAt/skillsCwd（旧载荷照常过守卫）；IPC settings:skills/-toggle/-delete/-reveal；keymap Comma 行；ShellUiAction toggle-settings；SettingsSection skills/packages + Agent Resources 导航组；PICODE_PI_AGENT_DIR（烟雾沙箱专用）。运行期实测探针枚举 72 行（沙箱 3 行 + 本机 ~/.agents SSOT），包 resolve 用 onMissing:'skip' 严格只读（绝不自动安装）。
  - 术语 rider：「设置窗（Settings Window）」已入 CONTEXT.md。
  - 注意：烟雾跑前 ps 复核每轮都做；一次撞 wt-65 dev-app 在跑，等待其退出后重试（未并跑）。
- 2026-09-11 (rebase onto main)：main 已前进（60/65/66 已并入，65 的 stage 也动 settings shell）——已在分支内预先 rebase 并解两处 additive 冲突（electron-smoke.mjs env 行双变量共存；smoke.ts 双 stage 顺序保留：60/65 后接 63）。重验：typecheck 绿 / vitest 1244 全绿 / 合并后 electron smoke ALL GREEN（60+65+63 三段同跑，13 hosts 零孤儿）。原提交 788c9d0 已重写为 407a79c + tracker 36a8ba8。

- 2026-09-11 (requirements intake): 建票（mgmt 追加需求，Q3=Q4=Q9=Q10=A）。波次：独立链（与 54–62 零文件交集），可即刻开工。**64 blocked by 本票**（同窗口文件）。术语 rider：「设置窗（Settings Window）」入 CONTEXT.md。契约增量：probe 报告技能来源维度（additive，实施时报备）。
- 2026-09-11 (release scope): 操作者拍板「全部赶 v1.5.0」——本票纳入 v1.5.0 发布范围，与 54–62 同批验收。
- 2026-09-11 (merge, T00 合并会话): **merged as 1edbaeb**（merge --no-ff；分支四提交 rebase 后落 main：feat=407a79c'，两笔 tracker 提交一撞票文件取 main 侧、一自动去重，帧提交干净重放）。
  - **验收口径**：操作者 2026-09-11 明示「63 已验收」；脚本门禁 typecheck 绿 + vitest **1244/1244（85 文件）**（1187 → 净增 +57：skills-management 32 / pi-settings-editor 14 / skills-service 9 等 4 新套件）；分支侧已预 rebase 并预验证（60/65/63 三 stage 同跑 ALL GREEN、13 hosts 零孤儿）——会话间协作先例。
  - **冲突处置**：2 处均例行 tracker 对撞（feat 携带 claimed 中间态 → 取 main 侧 ready-for-human 终态；tracker 提交重放对齐）——零代码冲突；rebase 记录（f0076b6 信息）留存 git 历史。
  - **终态审计**：AuthProbeReport skills* additive 字段 + IPC settings:skills/* + keymap Comma + ShellUiAction toggle-settings 全部在位；「设置窗」词条 L145（Packages 节留 64 衔接）；**2794d9c 范围增补项落地**（lstat 判型 L34 / 悬链标注失效 L61 / 主侧删除复核 L136）；smoke ticket-63 段；PackagesSection placeholder = 64 挂点就绪；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删。**解锁：64（Packages 管理，末张票）。**
