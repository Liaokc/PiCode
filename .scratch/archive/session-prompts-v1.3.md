# PiCode 1.3 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-3/spec.md`（R1–R11 决议与验收口径）。
> 需求定稿全记录（Q1–Q13 + ZCode 取证参数）：`.scratch/picode-1-3/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi13-* / z13-* / pitui13-tree`。
> 术语新增（导航轨 / 回底钮 / 分组折叠）随票入 CONTEXT.md；**调用轨迹词条草案**在 intake-grilling.md 附录，由票 38 落地。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.3 全部票未开工时点，当前 main @ d09bc28）
git tag -a picode-1-3-base -m "1.3 baseline: 1.2.0 shipped + 1.3 spec/tracker" main
# ② merge-ticket.sh 的 Status 门槛补 picode-1-3（1-2 批已绕过一次，勿再绕）：
#    scripts/merge-ticket.sh 第 50 行 ls-files 列表加入 ".scratch/picode-1-3/issues/${NN}-*.md"
# ③ 确认无活跃 worktree 残留：git worktree list
```

## 操作者流程（每张工单固定四步）

```bash
# ① 确认阻塞票已合入 main（见波次表）
# ② 创建 worktree + 分支（命令见各票块）
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
| **W1** | **38** Composer/Chrome 三合一 | composer menus + App 发送守门 + TitleBar + app.css 菜单段 + **CONTEXT.md 词条 rider** | 无 |
| | **39** 分组折叠分页 | Sidebar 组头区 + app.css 组头段（**本波唯一 Sidebar 写者**） | 无 |
| | **40** 面板开合动画 | app.css **面板容器段** + App 壳层变量 + SidePanel/BottomDock/TerminalDock 根元素 | 无 |
| | **42** 死 cwd 过滤 + 标题 | index-service + parse.ts（**本波唯一 parse 写者**） | 无 |
| **W2** | **41** 空态模型目录 | EmptyState/Composer menus + App 接线 + main probe 缓存 | 38 |
| | **43** History 树重塑 | parse.ts 节点预览 + TreePanel | 42 |
| **W3** | **44** 用户消息常驻复制 | ChatView（**串行链首**） | 无 |
| **W4** | **45** 滚离保持 + 回底钮 | ChatView（链二）+ 吸底纯函数 | 44 |
| **W5** | **46** 转录导航轨 | ChatView（链末）+ 导航轨纯模型 + visual 三帧 | 45 |

> W1 的 38/39/40 三票都会碰 app.css——**区段不相交**（菜单段 / 组头段 / 面板容器段），只增不改各追加自己的规则；若发现必须改同一规则块，停下回报操作者。38 与 40 都可能碰 App.tsx——union 级追加（守门 dispatch vs 壳层变量），冲突应止于 import 行。

**防冲突纪律**（同 v1.1/v1.2，三件事）：
1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
2. contract / app.css / CONTEXT.md **只增不改**（追加自己的区段/词条，不动别人行）；
3. 同波票撞同一热点函数 = 停下回报操作者。

**铁律**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke；其余 worktree 只跑 vitest + typecheck。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-3/issues/
本批波次表：.scratch/picode-1-3/session-prompts-v1.3.md 的「波次表」节
基线：tag picode-1-3-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。
开场先自查：scripts/merge-ticket.sh 的 Status 门槛必须已含 picode-1-3 目录——
若操作者还没改，先提醒其改完（或经其授权由你改，一行 ls-files 追加）再开始合并职责。

职责循环（操作者说「合并 NN」时）：
1. 前置检查：票文件 Status 必须是 ready-for-human；对应 worktree 必须干净
   （不干净先甄别：harness 产物按证据规则处置，见下）。
2. merge-gate 簿记：main 上的票文件若还是旧状态，用 git checkout <branch> -- <票文件>
   原样取分支终态到 main 提交 sync——必须原样取分支版本，分支自己的 tracker
   提交 rebase 时会自动去重/零冲突。
3. 若操作者未明说已验收：提醒其先在 worktree 跑 npm run dev 目检
   （dev-app serialization 铁律），得到明确「已验收」再继续。
4. 执行 bash scripts/merge-ticket.sh NN。rebase/合并冲突按性质分级：
   - tracker 状态对撞 → 例行，取 main 侧（HEAD）；
   - package-lock.json → 取任一侧后 npm install 再生再 add；
   - 契约 / IPC 注册 / 导入行 / app.css 追加区段 / CONTEXT.md 词条 → 双方保留（只增不改）；
   - 二进制 PNG → 取更新的一次重拍；两张都过时则取后合入侧并在 tracker 注明待重拍；
   - 语义级（同波票撞同一热点函数/规则块）→ 不许自作主张：git rebase --abort
     恢复干净，向操作者报告冲突文件 + 双方意图 + 整合指令草案，退回所属工单会话
     （先例模式：该会话 rebase main 自行整合 → 重跑验证门 → 二次验收 → 我重合）。
5. 合并后终态审计：抽查关键接缝是否在 main 上幸存（CONTEXT 词条 / app.css 区段 /
   纯函数套件 / 无冲突标记残留）；确认 typecheck + tests 绿（脚本已跑，报出确切测试数）。
6. tracker：Status 改 resolved，## Comments 追加 merge sha、验收口径、冲突处置记录。
7. 清理：git worktree remove .worktrees/wt-NN-* && git branch -d tNN-*；提醒其他
   活跃 worktree rebase main（附对撞面预判）。
8. 向操作者播报：本次合并解锁了哪些新工单（波次表）。

证据规则（worktree 里未跟踪/改动的截图）：
- 票特有新帧（新 harness 场景输出，46 的三帧、41/43 的对照帧等）→ 入库；
- 既有帧被重拍且属本票功能面、无更近的覆盖重拍 → 入库；
- 既有帧被重拍但即将被下一张票覆盖 → git restore 丢弃；
- 跨票回归验证产物 → 入库并在提交信息注明用途。

收官发布（操作者说「发布 vX.Y.Z」时）：
1. 手册归档（照 v1.0/v1.1/v1.2 先例，chore 提交到 .scratch/archive/）；
2. npm version X.Y.Z --no-git-tag-version（lockfile 同步）+ chore 提交；
3. npm run smoke 全绿 → npm run package:verify 真包冒烟 exit 0；任一失败即停手上报；
4. git tag -a vX.Y.Z（annotated，对齐先例）；
5. 安装守卫：/Applications/PiCode.app 在运行则拒绝替换、请操作者退出——绝不擅自杀任何
   PiCode/Electron 进程；替换后 PlistBuddy 验证 plist 版本并给首启巡检清单。

开场先摸底并向操作者播报：git worktree list、全票 Status+阻塞表、main 最新提交、波次前沿。

纪律：只在主工作区 ~/PiCode 操作；除冲突解决与 tracker/发布簿记外不写任何代码；不 push
到任何远端；一次只合并一张票；dev-app serialization 是铁律——撞上正在跑的 dev/已安装
app 先停手要人确认。
```

操作者对它只需说：「合并 NN」「已验收」「发布 vX.Y.Z」「（冲突时）已通知 XX 会话整合」。

---

## T38 — Composer/Chrome 三合一（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-38-composer-chrome -b t38-composer-chrome main
cd .worktrees/wt-38-composer-chrome && npm install
```

```text
/implement .scratch/picode-1-3/issues/38-composer-chrome-polish.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.3 总 spec 在
.scratch/picode-1-3/spec.md。你当前在 worktree 分支 t38-composer-chrome。

核心三件 + 一个 rider：
① 访问菜单行距（现状粗体名与描述两 span 相邻零间隙——CSS 缺失补齐）+
   盾牌分色（Full Access 橙 / Standard 灰 / Read Only 绿，复用既有色 token），
   decideGate 审批语义零改动；
② 删 TitleBar Help 幽灵按钮（无 onClick）；
③ / 菜单退役六条内建（EXECUTABLE_BUILTIN_NAMES 移除 new/tree/name/copy/
   model/thinking，compact 保留）+ 发送守门纯函数（裸/带参都拦，toast 指路，
   会话零发送）——守门表驱动落 Seam-1；
④ rider：调用轨迹（Call Trace）词条落 CONTEXT.md——草案原文在
   .scratch/picode-1-3/intake-grilling.md 附录，原样落库（本票是 1.3 首票，
   承担 1.2 漏落补账）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 38）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T39 — 分组折叠 + Show more 分页（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-39-group-fold -b t39-group-fold main
cd .worktrees/wt-39-group-fold && npm install
```

```text
/implement .scratch/picode-1-3/issues/39-group-fold-pagination.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
本批 W1 唯一 Sidebar 写者（只动组头区与 app.css 组头段，不碰 TaskItem/工具区）。
你当前在 worktree 分支 t39-group-fold。

核心：组行点击 = 整组折叠/展开（非归档）；展开恢复折叠前形状（Show more
步进位置不丢）；Show more 每次 +5、全展开转 Show less、Show less 一次回
初始 5 条；删 caret。形状机抽纯函数表驱动（Seam-1：初始/+5/showLess 重置/
collapse 记形状/expand 复原）——先例 panel-model。形状内存级不进偏好，
重启回默认；组头不加计数（Q9 拍板）。别碰归档（ticket-35 语义）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 39）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T40 — 面板开合动画（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-40-pane-animations -b t40-pane-animations main
cd .worktrees/wt-40-pane-animations && npm install
```

```text
/implement .scratch/picode-1-3/issues/40-panel-open-animations.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
ZCode 校准参数（200ms ease-out / 双变量内容裁切 / 拖拽降级仅 opacity）见票内
背景与 intake-grilling.md。你当前在 worktree 分支 t40-pane-animations。

核心：三面板（左栏/右面板/底部 dock）开合 200ms ease-out、尺寸+opacity 并动、
从停靠边拉出/收回；双变量模式——开合变量（关=0px）与内容真实宽度变量分离，
动画期间内容裁切不重排（xterm 免逐帧 reflow——TerminalDock 根元素不参与
逐帧 reflow）；拖拽 resizer 期间尺寸动画禁用（票 30 的 rAF 直写手感不回归）；
prefers-reduced-motion 直切；启动首帧不播。只动面板容器层与 app.css 面板段，
不碰各面板内部组件逻辑（SidePanel/BottomDock/TerminalDock 内容组件零改动）。
投影纯函数表驱动（Seam-1：open/width → 开合变量+内容变量）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 40）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T42 — 死 cwd 会话过滤 + 标题推导修正（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-42-dead-cwd-filter -b t42-dead-cwd-filter main
cd .worktrees/wt-42-dead-cwd-filter && npm install
```

```text
/implement .scratch/picode-1-3/issues/42-dead-cwd-filter-title.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
本批 W1 唯一 parse.ts 写者（43 在 W2 等你）。你当前在 worktree 分支
t42-dead-cwd-filter。

核心：① 索引扫描加 cwd 存活性维度——纯谓词（stat 结果注入，表驱动），
cwd 不存在的会话不进侧栏两视图也不进 ⌘K；in-app 活 host 会话豁免（运行中
cwd 被删不得从注册表/侧栏消失）；会话文件零改动、无删除/迁移动作；注意与
「隐藏永不使会话不可达」不变式的边界——本票过滤的是物理失效，不是偏好隐藏，
测试里写清这个区分。② firstUserText 跳过行首 <skill> 标签原文取后续有效
文本、缺失回退技能名（parse.ts；标题行为回归用现有 fixtures 扩展）。
electron smoke 用隔离 userData 种死 cwd 会话（只读种子，勿写真会话库）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 42）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T41 — New Task 空态模型/思考档（W2，阻塞：38 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-41-newtask-model-catalog -b t41-newtask-model-catalog main
cd .worktrees/wt-41-newtask-model-catalog && npm install
```

```text
/implement .scratch/picode-1-3/issues/41-newtask-model-catalog.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
零新契约——复用既有 --auth-probe 短命 host 机制与其 IPC 通道（票 11 先例），
main 层缓存目录。你当前在 worktree 分支 t41-newtask-model-catalog。

核心：空态模型菜单消费 probe 目录（投影纯函数：报告 → 菜单形，复用
groupModelsByProvider 同型）；芯片链式默认决议（偏好 defaultModel/
defaultThinkingLevel → Pi 兜底标注 default → 全无配置才落底纹提示语，
纯函数表驱动）；空态所选项进 pending 链随 create_session 送达（票 17 的
pending 通道先例）。思考档七档常量不依赖 host。空下拉必须消失。
不越界：不实现设置页新 UI，不改 probe 本身。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 41）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T43 — History 树重塑（W2，阻塞：42 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-43-history-tree-restyle -b t43-history-tree-restyle main
cd .worktrees/wt-43-history-tree-restyle && npm install
```

```text
/implement .scratch/picode-1-3/issues/43-history-tree-restyle.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
对照帧 .scratch/compare/pitui13-tree（Pi TUI /tree）。你当前在 worktree
分支 t43-history-tree-restyle。

核心：显示行序列 = SessionTreePayload 的纯函数（Seam-1 表驱动，fixture
jsonl → 行序列，sessions-trace 套件同型）——类型标签着色（user:/assistant:）、
工具调用入树（assistant 消息 toolCall 块 → [名称: 参数摘要] 等宽行，
节点预览在 parse.ts 扩展——42 已合入，你是该文件当下唯一写者）、other 类
噪音默认隐藏、缩进导轨、叶路径高亮。TreePanel 重写样式（桌面自有配色字体），
点行跳转/行尾 fork/current 标记行为不回归。TUI 键盘功能（搜索/label/copy/
filters）明确不做（Q8 拍板），不做任何搜索框。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 43）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T44 — 用户消息常驻复制（W3，ChatView 链首，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-44-user-copy -b t44-user-copy main
cd .worktrees/wt-44-user-copy && npm install
```

```text
/implement .scratch/picode-1-3/issues/44-user-message-copy.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
你是 ChatView 串行链（44→45→46）第一棒，改动收敛在用户气泡操作行，
别动滚动逻辑与转录结构（那是 45/46 的）。你当前在 worktree 分支 t44-user-copy。

核心：用户气泡下常驻 Copy 钮（Q10 拍板常驻，非悬停浮现）——样式对齐助手
操作行（图标+文案+✓反馈同族），复制原始文本，不带 Fork（fork 语义锚在
assistant entry）。electron smoke 断言剪贴板内容。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 44）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T45 — 滚离保持 + 回底钮（W4，阻塞：44 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-45-scroll-stay -b t45-scroll-stay main
cd .worktrees/wt-45-scroll-stay && npm install
```

```text
/implement .scratch/picode-1-3/issues/45-scroll-stay-jump-bottom.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
ChatView 串行链第二棒（44 已合入）。你当前在 worktree 分支 t45-scroll-stay。

核心：① 吸底决策收敛纯函数 shouldAutoScroll(滚动状态, 内容增长, 是否自己
发送)——仅 nearBottom（沿用 ~160px 阈值）或自发送时置底；废除现状
"grew 即强制拽底"（Q12 行为变更，这是导航轨 46 的前提）；② 滚离超阈值 →
composer 上方中央圆形 ↓ 钮淡入（ZCode 同型：card 底 outline 圆钮），点击
平滑回底 + 恢复吸底 + 淡出。注意与 46 的边界：本票不做左侧 tick 轨、不做
锚点定位——只做滚动行为与回底钮。electron smoke 三断言（滚离增长不拽底/
回底钮现→点击回底/自发送跳底）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 45）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T46 — 转录导航轨（W5，阻塞：45 已合入 · 1.3 收官票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-46-navigator-rail -b t46-navigator-rail main
cd .worktrees/wt-46-navigator-rail && npm install
```

```text
/implement .scratch/picode-1-3/issues/46-transcript-navigator-rail.md

规矩：CONTEXT.md 是术语权威；1.3 总 spec 在 .scratch/picode-1-3/spec.md；
ZCode turn navigator 校准参数与对照帧（z13-navigator-rail / z13-navigator-
hover）见票内背景与 intake-grilling.md；ChatView 串行链末棒（45 的吸底决策
与滚离态是你的地基）。新词条「导航轨（Turn Navigator）」「回底钮（Jump to
Latest）」随本票入 CONTEXT.md（措辞见 intake-grilling.md 术语节）。你当前在
worktree 分支 t46-navigator-rail。

核心：左缘轨（触区 ~48px / tick 列 ~36px 垂直居中可独立滚动）；每真实用户
消息一根 tick，等宽基条 + scaleX 焦点/活跃衰减（focus=前景/muted=次级，
锚定加亮、运行中 ≥0.72 不透明）；hover 右弹双段预览气泡（用户输入 clamp2 +
助手回复 clamp3，短延迟开合）；点击 smooth 定位（DOM 直查优先，未挂载
rAF 兜底）；tick<2 不渲染；窗口 <864px 不显示；轨显隐 opacity/位移过渡。
仅 ChatView，FollowView 不做。导航轨纯模型表驱动（Seam-1：锚点分数位、
tick 显隐规则）。性能红线：hover/点击零重渲染风暴（票 30 memo 基建），
帧对照三张（轨/气泡/滚离态）入库 .scratch/compare/。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 46）→
Status 改 ready-for-human + Comments 记 sha。
```
