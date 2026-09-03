# PiCode 1.2 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-2/spec.md`（工单 27–37 的决议与验收口径）。
> 术语新增（Unread / Call Trace / Archive / Recently Closed Tabs）随票入 CONTEXT.md。

## 代码基线（执行 prompt 前的快照）

- **基线 tag：`picode-1-2-base`** = 1.2 全部票未开工时点（v1.1.0 代码 @ 1fae8b7 + 1.2 spec/tracker + 九帧 ZCode 新取证）。
- 每张票的开工代码 = **main 最新**（前序波次已按表合入）。
- 验证：`git tag --points-at picode-1-2-base && git log --oneline picode-1-2-base -1`。

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文（自包含，1.1 实战教训已内化）：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-2/issues/
本批波次表：本手册「波次表」节（含同波热点文件规则）
基线：tag picode-1-2-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。

职责循环（操作者说「合并 NN」时）：
1. 前置检查：.scratch/picode-1-2/issues/NN-*.md 的 Status 必须是 ready-for-human；
   对应 worktree 必须干净（不干净先甄别：harness 产物按证据规则处置，见下）。
2. merge-gate 簿记：main 上的票文件若还是旧状态，用 git checkout <branch> -- <票文件>
   原样取分支终态到 main 提交 sync——必须原样取分支版本，这样分支自己的 tracker
   提交 rebase 时会自动去重/零冲突。
3. 若操作者未明说已验收：提醒其先在 worktree 跑 npm run dev 目检
   （dev-app serialization 铁律），得到明确「已验收」再继续。
4. 执行 bash scripts/merge-ticket.sh NN。rebase/合并冲突按性质分级：
   - tracker 状态对撞（claimed / 中间版评论 vs main 终态）→ 例行，取 main 侧（HEAD）；
   - package-lock.json → 取任一侧后 npm install 再生再 add；
   - 契约 / IPC 注册 / 导入行 → 双方保留（只增不改）；
   - 二进制 PNG → 取更新的一次重拍；两张都过时则取后合入侧并在 tracker 注明待重拍；
   - 语义级（业务逻辑 / 架构对撞，含「同波票撞同一热点函数」）→ 不许自作主张：
     git rebase --abort 恢复干净，向操作者报告冲突文件 + 双方意图 + 整合指令草案，
     退回所属工单会话（先例模式：该会话 rebase main 自行整合 → 重跑验证门 →
     二次验收 → 我重合）。
5. 合并后终态审计：凡分支自带整合提交的合并，抽查关键接缝是否在 main 上幸存
   （契约注册/探针顺序/无冲突标记残留）；确认 typecheck + tests 绿（脚本已跑，
   报出确切测试数）。
6. tracker：Status 改 resolved，## Comments 追加 merge sha、验收口径、冲突处置记录。
7. 清理：git worktree remove .worktrees/wt-NN-* && git branch -d t-NN-*；提醒其他
   活跃 worktree rebase main（附对撞面预判）。
8. 向操作者播报：本次合并解锁了哪些新工单（管线见本手册波次表）。

证据规则（worktree 里未跟踪/改动的截图）：
- 票特有新帧（新 harness 场景的输出）→ 入库；
- 既有帧被重拍且属本票功能面、无更近的覆盖重拍 → 入库；
- 既有帧被重拍但即将被下一张票的更新重拍覆盖 → git restore 丢弃；
- 跨票回归验证产物 → 入库并在提交信息注明用途。

收官发布（操作者说「发布 vX.Y.Z」时）：
1. 手册/工作簿归档（照 v1.0/v1.1 先例，chore 提交）；
2. npm version X.Y.Z --no-git-tag-version（lockfile 同步）+ chore 提交——版本号会写进安装包 plist；
3. npm run smoke 全绿 → npm run package:verify 真包冒烟 exit 0；任一失败即停手上报；
4. git tag -a vX.Y.Z（annotated，对齐 v1.0.0/v1.1.0 先例）；
5. 安装守卫：/Applications/PiCode.app 在运行则拒绝替换、请操作者退出——绝不擅自杀任何
   PiCode/Electron 进程（dev app 同理，可能连着真实会话库）；替换后 PlistBuddy 验证
   plist 版本并给首启巡检清单。

开场先摸底并向操作者播报：git worktree list、全票 Status+阻塞表、main 最新提交、波次前沿。

纪律：只在主工作区 ~/PiCode 操作；除冲突解决与 tracker/发布簿记外不写任何代码；不 push
到任何远端；一次只合并一张票；dev-app serialization 是铁律——撞上正在跑的 dev/已安装
app 先停手要人确认。
```

操作者对它只需说：「合并 NN」「已验收」「发布 vX.Y.Z」「（冲突时）已通知 XX 会话整合」。

## 操作者流程（每张工单固定四步）

```bash
# ① 确认阻塞票已合入 main（见波次表）
# ② 在主工作区创建 worktree + 分支（命令见各票块）
# ③ cd 进 worktree && npm install
#    （国内网络慢可加 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
# ④ 在 worktree 目录里启动 pi，粘贴对应 prompt
```

完成后：实现会话提交到自己的分支并停下；**你来合并**（或交给 T00）：

```bash
cd ~/PiCode && bash scripts/merge-ticket.sh <NN>
# 其余活跃 worktree 逐个 git rebase main
```

## 波次表（5 波，同波热点文件规则见「防冲突纪律」）

| 波次 | 工单 | 碰撞面要点 | 阻塞 |
|---|---|---|---|
| **W1** | **27** 键位重映射 | App keydown 块 + TitleBar tooltip | 无 |
| | **28** 选中语义 + 未读 | Sidebar TaskItem + App effects + preferences（**本波唯一 TaskItem/Sidebar 写者**） | 无 |
| | **30** 交互性能 | Markdown / SidePanel / BottomDock（**本波唯一面板写者**） | 无 |
| **W2** | **29** 侧栏拖宽 | Sidebar aside 边缘 + preferences 宽度字段 | 无 |
| | **31** 预览多文件 tab | SidePanel / PreviewTab / panel-model / preferences 最近关闭栈 | 30 |
| | **34** 置顶行几何 | Sidebar TaskItem + app.css（**本波唯一 TaskItem 写者**） | 28 |
| **W3** | **32** 预览块级供面 | PreviewTab（唯一写者） | 31 |
| | **33** 筛选下拉 + createdAt | Sidebar tools 区 + sessions 流水线 + 契约 | 无 |
| | **35** 右键菜单 + 归档 | Sidebar TaskItem + App + preferences（**本波唯一 TaskItem 写者**） | 28, 34, 33 |
| **W4** | **36** 轨迹 tab 骨架 | 契约 + host + 新 TraceTab + 菜单 trace 项入座（**本波唯一 TaskItem/Sidebar 写者**） | 30, 31, 35 |
| **W5** | **37** 轨迹工具面 | TraceTab + follow 通道 | 36 |

> W2/W3 各含两张同文件不同区域的票（29↔34：aside 边缘 vs TaskItem；33↔35：tools 区 vs TaskItem）——union 级追加，冲突应止于 import 行。若发现必须改同一函数，停下回报操作者（分解有问题）。

**防冲突纪律**（同 v1.1，三件事）：
1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
2. contract / app.css / Sidebar 列表 **只增不改**（追加自己的区段，不动别人行）；
3. 同波票撞同一热点函数 = 停下回报操作者。

**铁律**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke；其余 worktree 只跑 vitest + typecheck。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T27 — 键位重映射（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-27-keymap-remap -b t27-keymap-remap main
cd .worktrees/wt-27-keymap-remap && npm install
```

```text
/implement .scratch/picode-1-2/issues/27-keymap-remap.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.2 总 spec 在
.scratch/picode-1-2/spec.md。你当前在 worktree 分支 t27-keymap-remap。

核心：⌘B=左侧栏 / ⌥⌘B=右侧面板 / ⌘J=终端（不变）/ ⌥⌘J=Bridge；判定用
event.code（macOS Option 组合字符）；标题栏四钮 tooltip 转 R1 键帽态。
键位解析抽纯函数表驱动（Seam-1）。不越界改 dock/面板行为本身。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 27）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T28 — 选中跟随视图 + 未读状态点（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-28-sidebar-selection -b t28-sidebar-selection main
cd .worktrees/wt-28-sidebar-selection && npm install
```

```text
/implement .scratch/picode-1-2/issues/28-sidebar-selection-unread.md

规矩：CONTEXT.md 是术语权威（状态点/Live Follow 语义）；1.2 spec 在
.scratch/picode-1-2/spec.md；根因取证见票内背景（followedFile 不改
focusedId、bg-inset 不可分辨）。你当前在 worktree 分支
t28-sidebar-selection。

核心：侧栏行状态改「当前视图」单一派生（Follow 激活→followed 行选中、
focused 行还原）；未读 = 本地偏好（mtime 水位 + 手动覆盖位），非聚焦回合
粒度自动置、聚焦自动清、靛蓝实心点、优先级橙>蓝动>绿>靛蓝>空槽
（sidebarDotState 纯投影扩展，表驱动）。手动菜单入口在票 35，本票只做
模型层。归档排除（归档本身在票 35）——本票预留过滤位即可，不实现归档。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 28）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T30 — 交互性能：拖拽直写 + memo（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-30-panel-perf -b t30-panel-perf main
cd .worktrees/wt-30-panel-perf && npm install
```

```text
/implement .scratch/picode-1-2/issues/30-panel-interaction-perf.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
根因已实证于票内背景（pointermove 逐事件 dispatch + Markdown 无 memo）。
你当前在 worktree 分支 t30-panel-perf。

核心：拖拽期 rAF 合帧直写 DOM 尺寸、pointerup 才 commit（侧面板拖宽 +
底部 dock 拖高同模式）；Markdown 组件 memo 化。滚动卡顿验收第一步 =
Performance 面板大 markdown 前后 flamegraph 归档 + 数字记票；修完仍卡
则继续追（DOM 重量/CSS 效应），不要只交拖拽修复。本票是票 36 的性能前置。

流程：Status→claimed → 复现实测→修→复测对照 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 30）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T29 — 侧栏拖宽 + 两面板宽度持久化（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-29-sidebar-resize -b t29-sidebar-resize main
cd .worktrees/wt-29-sidebar-resize && npm install
```

```text
/implement .scratch/picode-1-2/issues/29-sidebar-resize-persist.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md。
你当前在 worktree 分支 t29-sidebar-resize。

核心：侧栏右缘 resizer（交互模式复用侧面板 pointer-capture 先例），
240–520px 默认 320、双击重置；侧栏 + 侧面板宽度均持久化（preferences
normalize/merge 更新，表驱动）。拖拽期直写 DOM（票 30 模式）+ pointerup
commit。只动 aside 边缘与偏好，不碰 TaskItem/工具区（W2 有 31/34 同行）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 29）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T31 — 预览多文件 tab + 管理下拉 + 最近关闭（W2，阻塞：30 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-31-preview-multi-tabs -b t31-preview-multi-tabs main
cd .worktrees/wt-31-preview-multi-tabs && npm install
```

```text
/implement .scratch/picode-1-2/issues/31-preview-multi-tabs.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
ZCode 基准实拍 .scratch/compare/z-tab-dropdown.png。你当前在 worktree
分支 t31-preview-multi-tabs。

核心：面板 tab 身份扩为 review | file(cwd,path) | trace(sessionFile)
（trace 槽位就位、消费在票 36）；文件各成 tab（×可关互不影响）；⌄ 改开
管理下拉（搜索计数+导航 / 打开的标签页 / 最近关闭：持久化容量 10、相对
时间、点击重开）；深链 openPreview = 开新 tab/聚焦既有；「收起面板」由
标题栏钮 + ⌥⌘B（票 27）承担。panel-model 纯 reducer 表驱动。本票是
票 36 的框架前置；块级 chrome 不在本票（票 32）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 31）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T34 — 置顶行零位移 + Show more 对齐（W2，阻塞：28 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-34-row-geometry -b t34-row-geometry main
cd .worktrees/wt-34-row-geometry && npm install
```

```text
/implement .scratch/picode-1-2/issues/34-sidebar-row-geometry.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
ZCode 形态参照 .scratch/compare/z-session-hover-archive.png（注意：ZCode
pin 在行首，操作者拍板不要该形态——pin 固定行尾）。你当前在 worktree
分支 t34-row-geometry。

核心：置顶行 [点槽][标题][时间][橙pin]，时间定宽槽、悬停只隐文字
（visibility/opacity ~150ms）、pin 零位移；非置顶行悬停 pin 同位出现；
Show more/less 对齐标题文本（x=34）。几何探针断言悬停前后 pin x 不变
（票 15 密度探针先例，visual harness 扩展）。

流程：Status→claimed → 几何探针先行 → 全英文文案 → code-review →
提交当前分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 34）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T32 — 预览块级供面转正（W3，阻塞：31 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-32-preview-chrome -b t32-preview-chrome main
cd .worktrees/wt-32-preview-chrome && npm install
```

```text
/implement .scratch/picode-1-2/issues/32-preview-block-chrome.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
块级组件票 16 已交付（这是范围扩展非新造）。你当前在 worktree 分支
t32-preview-chrome。

核心：Preview rendered 态 chrome 开启——代码格/表格卡片与主转录同款；
source 态（窗口化文本）不变。块 key 稳定性回归不破。visual 帧核验
（预览块卡片对照转录帧）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 32）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T33 — 筛选下拉 + createdAt 契约（W3，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-33-filter-dropdown -b t33-filter-dropdown main
cd .worktrees/wt-33-filter-dropdown && npm install
```

```text
/implement .scratch/picode-1-2/issues/33-filter-dropdown-sort.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
ZCode 基准实拍 .scratch/compare/z-filter-menu.png（视图/排序两组）。
你当前在 worktree 分支 t33-filter-dropdown。

核心：FilterIcon 开下拉（By project/Timeline + Updated/Created，当前
选择持久化）；Timeline 全平铺、置顶区保留顶部；排序纯函数进分组流水线；
createdAt 从文件 birthtime 入 SessionSummary（契约纯增量、缺失降级、
host-contract smoke 断言）；文本筛选行退役、Expand-all 死钮删除。只动
tools 区与 sessions 流水线，不碰 TaskItem（W3 有 35 同行）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 33）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T35 — 右键菜单 + 归档（W3，阻塞：28、34、33 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-35-context-menu-archive -b t35-context-menu-archive main
cd .worktrees/wt-35-context-menu-archive && npm install
```

```text
/implement .scratch/picode-1-2/issues/35-session-context-menu-archive.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
ZCode 基准实拍 .scratch/compare/z-context-menu.png（九项子集与分组顺序）
与 z-session-hover-archive.png（悬停态参照——落位按操作者拍板：pin 按票 34
行尾、归档钮临时替换点槽）。你当前在 worktree 分支
t35-context-menu-archive。

核心：九项右键菜单（Pin/Rename/Archive/Mark as Unread↔Read │ Reveal in
Finder/Copy task path/Copy session file path/Copy session ID │ View call
trace 入口入座、消费在票 36）；归档 = 会话级本地偏好（悬停钮临时替换点槽
零重叠零位移、两视图消失、⌘K 可达、置顶归档隐含取消置顶、Trash 死钮接
归档列表视图 + 一键恢复）；Reveal/Copy 三动作 host 只读 IPC；Mark as
Unread 接票 28 手动覆盖位。归档过滤纯函数（「隐藏永不使会话不可达」
不变式，filterHiddenGroups 先例）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 35）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T36 — 调用轨迹 tab 骨架（W4，阻塞：30、31、35 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-36-call-trace-tab -b t36-call-trace-tab main
cd .worktrees/wt-36-call-trace-tab && npm install
```

```text
/implement .scratch/picode-1-2/issues/36-call-trace-tab.md

规矩：CONTEXT.md 是术语权威（ADR-0002 用量数据源）；1.2 spec 在
.scratch/picode-1-2/spec.md；ZCode 基准实拍
.scratch/compare/z-trace-{header,expanded,collapsed}.png（entry=一次模型
调用、输入/输出两节、工具结果入下一 entry 输入节）。你当前在 worktree
分支 t36-call-trace-tab。

核心：右键 View call trace 开 Trace tab（身份=会话文件，票 31 框架）；
host 纯函数从 jsonl 构建 per-call 载荷（六类块 + usage 列按 ADR-0002 推导、
缺席降级、契约纯增量）；默认全展开 + 长块截断/展开钮；头部统计行 +
刷新/关闭/打开所在目录（会话 jsonl）。数据源如实原则：显什么 = Pi 会话
文件实际记录（无标题生成调用、system prompt 通常缺席——票内已写明，不是
缺陷）。载荷构建器 fixture 表驱动；性能预算：大文件实测数字记票，超预算
做窗口化/懒展开（复用票 30 memo 基建）。活跟随/搜索/块开关在票 37，
不要越界。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 36）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T37 — 轨迹工具面：活跟随 + 搜索 + 块开关 + 展开收起（W5，阻塞：36 已合入；1.2 收官票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-37-trace-tools -b t37-trace-tools main
cd .worktrees/wt-37-trace-tools && npm install
```

```text
/implement .scratch/picode-1-2/issues/37-trace-tools.md

规矩：CONTEXT.md 是术语权威；1.2 spec 在 .scratch/picode-1-2/spec.md；
ZCode 基准实拍 .scratch/compare/z-trace-search.png（搜索 0/0 计数+↑↓×）、
z-trace-block-toggles.png（六类块 toggle）、z-trace-expanded/collapsed.png
（展开收起两态）。你当前在 worktree 分支 t37-trace-tools。

核心：活跟随（文件增长即重推导推送，follow 通道语义复用，停止条件与
FollowView 惯例一致）；搜索计数+导航+命中定位；六类块开关（默认全开）；
全部展开↔收起切换。渲染状态纯 reducer 表驱动（Seam-1）；electron smoke
增长刷新断言；visual 三态帧。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 37）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## 附：完成后验收（操作者手工环节）

1. 合并前在 worktree 里跑 `npm run dev` 亲自过目该票行为（样式类票与 ZCode
   实机并排对照：z-tab-dropdown / z-filter-menu / z-context-menu /
   z-trace-* 九帧已归档 `.scratch/compare/`）；
2. 合并：`cd ~/PiCode && bash scripts/merge-ticket.sh <NN>`（或交给 T00）；
3. 清理已合并票：`git worktree remove .worktrees/wt-<NN>-* && git branch -d t<NN>-*`；
4. 其他活跃 worktree 逐个 `git rebase main`；
5. 票 Status 已是 ready-for-human → 验收满意后改 `resolved`（T00 也会代改）；
6. 1.2 收官：13 张之外本批 11 张全 resolved 后打 tag `picode-1-2-final`、
   归档本手册、评估版本号 bump。
