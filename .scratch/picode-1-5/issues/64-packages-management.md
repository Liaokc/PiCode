# 64: 包管理（Packages 节）——全局 + 项目级 + 信任态展示

**What to build:** 设置窗 **Packages 节**（Q8 拍板 A——UI 词汇用 Pi 本体的 Packages，不用 ZCode 的 plugin；不做市场）：① **全局层**：settings `packages` 数组列表（来源 npm:/git:/本地路径），安装（输入来源）、移除、启停——读写 settings.json（与 `pi install/remove` 同落点）；② **项目级层**（Q2 拍板 C）：当前 cwd 的 `.pi/settings.json` packages 列表 + 安装/移除/启停；③ **信任态只读展示**（Q11 拍板 A）：读 trust.json 显当前项目 trusted / untrusted（含 `defaultProjectTrust: "ask"` 且无决策 = untrusted 的派生态）；untrusted 时明示「项目资源未被 Pi 加载」——信任决策本身留给 Pi 的 /trust，PiCode 不代写 trust.json。包内组件构成（extensions/skills/prompts/themes 计数）展示。全英文文案。

**背景（取证）：** Pi packages = `pi install npm:/git:/本地` + settings `packages` 数组（docs/packages.md）；per-资源启停 = 包条目内 skills/extensions 增量数组（`pi config` 同格式）；**信任门实测**（SDK `resolveProjectTrusted`）：trust.json 保存决策优先（本机 /Users/liaokechen/PiCode: true）；无决策时 SDK host 无 UI → `defaultProjectTrust: "ask"` 返回 false（项目资源静默忽略——安全默认）；**受信任项目缺失 npm/git 包在会话创建时自动安装**（resourceLoader installMissing）——项目级配置真实生效，PiCode 写配置、Pi 裁决加载，不越权。安装走 host 侧包管理（npm/git 源）需防抖与进行态提示；安全提示文案沿用 Pi 官方（packages run with full system access）。

**Blocked by:** 63（同窗口文件——Packages 节挂进 63 交付的设置窗节导航）。

**Status:** ready-for-human

- [ ] 全局层：packages 列表（来源解析 npm:/git:/local 徽标）+ 安装（来源输入 + 拉取进行态 + 失败 toast）+ 移除（确认框）+ 启停——settings.json 读写与 `pi install/remove` 同落点
- [ ] 项目级层：cwd 的 .pi/settings.json 列表 + 安装/移除/启停；与全局层同组件复用
- [ ] 信任态只读展示：trust.json 读取 + ask-无决策派生 untrusted；untrusted 横幅「项目资源未被 Pi 加载」；零 trust.json 写入（表驱动断言）
- [ ] 包组件构成展示（extensions/skills/prompts/themes 计数）
- [ ] Seam-1 表驱动：包列表投影（来源/作用域/启停）+ settings 变更推导 + 信任态派生
- [ ] electron smoke：全局安装/移除/启停 + 项目级列表 + untrusted 横幅
- [ ] visual harness：Packages 节帧（全局 + 项目级 + untrusted 态）
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 64`。

## Comments

- 2026-09-14 (scope addition, operator-directed): Skills 节展示改版并入本票交付——原实施会话自建的票 67 经操作者拍板降级（「工单降级，然后合并到64」），工单文件已删，工作以范围增补落在本分支。内容：① Skills 节改**双卡**（Global skills / Project skills，scope 投影，合并仍为 Pi 完整加载面）；② Project 卡**按项目分组**——新 IPC `settings:projects`（additive：SessionIndexService 派生 + hasProjectTrustResources fs 预筛，真实库 59 项目只剩真实候选），listSkills 逐项目探测（4 并发批次渐进渲染，main 按 cwd 缓存），组头带 trust chip（SkillsReport additive 可选 trust，probe 已算透传，旧载荷照常过守卫），空组折叠为汇总行；③ **双搜索入口**：技能搜索（节顶部一框过滤两卡行）+ 项目搜索（Project 卡内过滤组）；④ 卡头三件套 .packages-card-header/-title/-file-note 通用化为 .settings-card-head/-title/-note（Skills/Packages 共用）；⑤ 工具条间距修复（count/chip/search 与 Refresh 间 10px gap）；⑥ **顺带修复 probe-runner 潜伏 bug**（票 63 起：cwd 为空时 agentDir 参数错位到 cwd 槽，probe 静默用真实 agent dir——cwd 槽恒占位空串修复）；⑦ CONTEXT.md 设置窗词条更新（Skills 双卡展示）。提交：149a5d6 + b1fa706 + 4224080 + 1a17b50（本分支线性叠加，t67 分支已删）。门禁（分支侧）：vitest **1313**（+9）全绿；electron smoke 全绿（63 阶段沙箱行在 Global 卡断言 + 64 阶段不受扰）；visual s5/s6 重拍。合并顺序恢复为**仅 64**。
- 2026-09-14 (done): 全验收项通过，提交 **794f1b4**（feat=c4be75b + code-review 清理 794f1b4，分支 t64-packages-management，未自行 merge——请操作者/合并会话执行 `bash scripts/merge-ticket.sh 64`）。
  - Gates：typecheck 双 tsconfig 绿；eslint 0 error（1 条 pre-existing warning，非本票）；vitest **1304 全绿（87 文件）**（1244 → 净增 +60：Seam-1 packages-management 36 / packages-service 24）；electron smoke 全绿（含 ticket-64 stage：全局空态 / op host 安装相对化落盘 / 启停全-[] pi-config 形与字符串形互转 / 确认框移除 / 项目层行 + untrusted 横幅 + 动作锁定 / **零 trust.json 写入字节级红线**）；host-contract / pty / usage / interop 冒烟全绿；visual s6 Packages 帧（NPM/Git/LOCAL 徽标、组件计数、Disabled 态、项目层 + NOT TRUSTED chip + 横幅 + 锁定动作）。
  - **Additive 报备**：AuthProbeReport 增 packages/projectPackages/packagesError/packagesScannedAt/packagesCwd/projectTrust（旧载荷照常过守卫）；IPC `settings:packages/-toggle/-op` + 广播通道 `settings:packages-progress`；host argv 新模式 `--packages-op`（沙箱 agentDir 参数沿用 63 惯例）；preload/env.d.ts settings 桥增 listPackages/togglePackage/installPackage/removePackage/onPackagesProgress；SettingsWindow 增 onNotify prop（App 的 toast 栈下放）。
  - **实现要点**：① 全局/项目两层同组件复用（PackageList 双 scope 渲染）；② 安装/移除走 op host 内 SDK DefaultPackageManager（与 `pi install/remove` 同代码路径）——实测 pi 将本地源**相对化**写入 settings（agentDir 相对形），UI 与冒烟按该规范形断言；③ 包级启停 = pi config 同格式：关 = 包条目四过滤数组全 `[]`（SDK 明文 load-none 语义），开 = 摘空数组回退字符串形（已知取舍：关→开会覆盖手工 per-资源过滤器，代码注释在案）；④ 信任门 = trust.json 最近父目录步行（纯函数 savedTrustDecision）+ 无决策按 defaultProjectTrust 派生（ask/never → untrusted）；probe 侧走 SDK ProjectTrustStore 同推导；**零 trust.json 写入**（main 侧门禁 + probe 只读 + 冒烟字节级断言）；⑤ untrusted 时项目安装/移除/启停全部锁定（镜像 pi 自身对 project 写的拒绝）；⑥ 失败 toast 走 App 的 notify 栈（新增 SettingsWindow onNotify 透传）。
  - 冒烟环境备注：ticket-44 真实焦点窃取步对机器占用敏感（连续多次 the window never took focus——屏幕锁定/打字期均必败），重试至机器空闲后全绿；与本票代码无关（改动零触焦路径，前两次同代码通过）。
  - 术语 rider：「Packages 节」已入 CONTEXT.md（设置窗词条同步更新）。
  - code-review 双轴通过：Standards 0 硬违规（ADR-0003 / Seam-1 纯度 / additive-only / 全英文文案 / 零 trust.json 写入全数核验；2 条判断性 smell 裁定不动作），Spec 验收项逐条对照无缺失无越权；清理修正 794f1b4（死代码 canonicalDir 删除 + 具名计数类型）。
- 2026-09-14 (progress): 实现完成，门禁进行中。Seam-1 新套件 packages-management 36 测试 + packages-service 24 测试（toggle 推导/信任门/零 trust.json 写入表驱动断言）；probe 报告 additive 增 packages/projectPackages/packagesError/packagesScannedAt/packagesCwd/projectTrust（旧载荷照常过守卫）；新 IPC settings:packages/-toggle/-op + 进度广播通道；op host（--packages-op）走 SDK DefaultPackageManager——与 pi install/remove 同代码路径（实测：本地源安装落盘为相对 agentDir 的规范化形式，pi 本体行为，冒烟按规范形断言）；信任门 = trust.json 保存决策（最近父目录步行）+ 无决策时 defaultProjectTrust 派生，ask/never → untrusted；冒烟阶段已写入（全局安装/启停/移除 + 项目层 + untrusted 横幅 + 零 trust.json 写入红线）。已绿：typecheck 双 tsconfig / lint 0 error / vitest 1304 / host-contract / pty / usage / interop / visual s6 帧。**阻塞：electron 冒烟连续 5 次卡在票 44 真实焦点窃取（非本票代码——前两次同代码通过；症状与操作者锁屏/高我不在机前吻合），待操作者解锁机器后重跑。**
- 2026-09-11 (claim): 实施会话认领（worktree wt-64-packages-management / 分支 t64-packages-management，已 rebase 于 main 最新——63 已并入，PackagesSection 挂点就绪）。开工前 ps 复核：无其他 PiCode Electron/dev-app/smoke 进程在跑。
- 2026-09-11 (requirements intake): 建票（mgmt 追加需求，Q2=C + Q8=Q11=A）。波次：独立链，**Blocked by 63**（同窗口文件）。操作者当前 packages 数组为空（首用户亦空态——空态文案如实）。安全文案沿用 Pi 官方口吻（packages run with full system access）。与 54–62 零文件交集。
- 2026-09-11 (release scope): 操作者拍板「全部赶 v1.5.0」——本票纳入 v1.5.0 发布范围。
