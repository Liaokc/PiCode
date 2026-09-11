# 64: 包管理（Packages 节）——全局 + 项目级 + 信任态展示

**What to build:** 设置窗 **Packages 节**（Q8 拍板 A——UI 词汇用 Pi 本体的 Packages，不用 ZCode 的 plugin；不做市场）：① **全局层**：settings `packages` 数组列表（来源 npm:/git:/本地路径），安装（输入来源）、移除、启停——读写 settings.json（与 `pi install/remove` 同落点）；② **项目级层**（Q2 拍板 C）：当前 cwd 的 `.pi/settings.json` packages 列表 + 安装/移除/启停；③ **信任态只读展示**（Q11 拍板 A）：读 trust.json 显当前项目 trusted / untrusted（含 `defaultProjectTrust: "ask"` 且无决策 = untrusted 的派生态）；untrusted 时明示「项目资源未被 Pi 加载」——信任决策本身留给 Pi 的 /trust，PiCode 不代写 trust.json。包内组件构成（extensions/skills/prompts/themes 计数）展示。全英文文案。

**背景（取证）：** Pi packages = `pi install npm:/git:/本地` + settings `packages` 数组（docs/packages.md）；per-资源启停 = 包条目内 skills/extensions 增量数组（`pi config` 同格式）；**信任门实测**（SDK `resolveProjectTrusted`）：trust.json 保存决策优先（本机 /Users/liaokechen/PiCode: true）；无决策时 SDK host 无 UI → `defaultProjectTrust: "ask"` 返回 false（项目资源静默忽略——安全默认）；**受信任项目缺失 npm/git 包在会话创建时自动安装**（resourceLoader installMissing）——项目级配置真实生效，PiCode 写配置、Pi 裁决加载，不越权。安装走 host 侧包管理（npm/git 源）需防抖与进行态提示；安全提示文案沿用 Pi 官方（packages run with full system access）。

**Blocked by:** 63（同窗口文件——Packages 节挂进 63 交付的设置窗节导航）。

**Status:** ready-for-agent

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

- 2026-09-11 (requirements intake): 建票（mgmt 追加需求，Q2=C + Q8=Q11=A）。波次：独立链，**Blocked by 63**（同窗口文件）。操作者当前 packages 数组为空（首用户亦空态——空态文案如实）。安全文案沿用 Pi 官方口吻（packages run with full system access）。与 54–62 零文件交集。
- 2026-09-11 (release scope): 操作者拍板「全部赶 v1.5.0」——本票纳入 v1.5.0 发布范围。
