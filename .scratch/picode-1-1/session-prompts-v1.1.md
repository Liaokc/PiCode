# PiCode 1.1 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-1/spec.md`（工单 14–26 的决议与验收口径）。

## 代码基线（执行 prompt 前的快照）

- **基线 tag：`picode-1-1-base`** = 1.1 全部票未开工时点（v1.0.0 代码 + 1.1 spec/tracker + ZCode 比对证据）。
- 票 14 的开工代码 = 该 tag；其后每张票的开工代码 = **main 最新**（前序票已按波次合入）。
- 验证：`git tag --points-at picode-1-1-base` / `git log --oneline picode-1-1-base -1`。

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

职责循环（操作者说「合并 NN」时）：
1. 前置检查：.scratch/picode-1-1/issues/NN-*.md 的 Status 必须是 ready-for-human；
   对应 worktree 必须干净（git status 无未提交内容）。
2. 若操作者未明说已验收：提醒其先在该 worktree 跑 npm run dev 目检
   （遵守 AGENTS.md dev-app serialization），得到明确「已验收」再继续。
3. 票 20 特别项：合并前确认 ADR-0006（docs/adr/0006-*.md）已在分支上落盘。
4. 执行 bash scripts/merge-ticket.sh NN。rebase/合并冲突按脚本提示处理：
   - package-lock.json → 取任一侧后 npm install 再生再 add；
   - 契约/IPC 注册文件 → 双方保留（只增不改）；
   - 语义级冲突（业务逻辑对撞）→ 不许自作主张：停下，向操作者报告冲突文件
     与双方意图，建议退回所属工单会话处理。
5. 合并后确认 typecheck+tests 绿；把工单 Status 改为 resolved，并在
   ## Comments 追加合并 sha 与验收口径。
6. 清理：git worktree remove .worktrees/wt-NN-* && git branch -d t-NN-*；
   提醒其他活跃 worktree rebase main。
7. 向操作者播报：本次合并解锁了哪些新工单（管线见本手册波次表）。

纪律：只在主工作区 ~/PiCode 操作；除冲突解决与 tracker 状态更新外不写任何
代码；不 push 到任何远端；一次只合并一张票。
```

操作者对它只需要说两种话：「合并 NN」和「已验收」。

## 操作者流程（每张工单固定四步）

```bash
# ① 确认阻塞票已合入 main（见波次表；git log --oneline | head 查合并记录）
# ② 在主工作区创建 worktree + 分支（命令见各票块）
# ③ cd 进 worktree && npm install   （国内网络慢可加：
#    ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install）
# ④ 在 worktree 目录里启动 pi，粘贴对应 prompt
```

完成后：实现会话把票提交到自己的分支并停下；**你来合并**（或交给 T00）：

```bash
cd ~/PiCode && bash scripts/merge-ticket.sh <NN>
# 若还有其他活跃 worktree，进各自目录执行 git rebase main
```

## 波次与最大并发（依据 14–26 的阻塞边）

| 波次 | 可同时进行 | 解锁条件 | 并发数 |
|---|---|---|---|
| W1 | **14 ∥ 22 ∥ 15** | 无（立即可开） | 3（上限） |
| W2 | **23 ∥ 24 ∥ 16** | 14 / 22 已合入 | 3 |
| W3 | **17 ∥ 18 ∥ 20** | （20 建议在 14 后） | 3 |
| W4 | **19 ∥ 25 ∥ 21** | 17+22 / 20 | 3 |
| W5 | **26** | 19 已合入 | 1 |

**铁律**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke；其余 worktree 只跑 vitest + typecheck。

---

## T14 — 会话打开闭环：结构化回放（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-14-replay-structure -b t14-replay-structure main
cd .worktrees/wt-14-replay-structure && npm install
```

```text
/implement .scratch/picode-1-1/issues/14-session-open-closure.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 有效；1.1 总 spec 在
.scratch/picode-1-1/spec.md（本票=结构化回放；回合折叠/Follow 升级分别在
票 23/24，不要越界实现）；三轮 ZCode 实机取证在
.scratch/picode-1-1/findings-ui-comparison.md；证据截图 .scratch/compare/。
你当前在 worktree 分支 t14-replay-structure；基线 tag picode-1-1-base。

核心：history 载荷从纯文本升级为结构化条目（思考含时长/工具终态/技能标记），
回放以折叠态思考行+终态工具卡渲染，与 live 同构——resume 不再丢内容。
契约纯增量（既有消息不改名不删除）；每类条目 reducer 表驱动测试。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 14）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T22 — Tooltip 统一组件 + 会话行静音（W1，无阻塞；**prefactor：16/18/19 的新按钮直接消费它**）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-22-tooltip-system -b t22-tooltip-system main
cd .worktrees/wt-22-tooltip-system && npm install
```

```text
/implement .scratch/picode-1-1/issues/22-tooltip-system.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
ZCode tooltip 基准实拍 .scratch/compare/z-tooltip-style.png（键帽样式）。
你当前在 worktree 分支 t22-tooltip-system。

本票是 prefactor：① 会话行移除长 tooltip（现状原生 title="标题 — cwd"）；
② 统一 tooltip 组件两态（短描述 / 快捷键键帽），替换全部原生 title；
③ 对既有按钮做一轮走查并归档清单（后续票 16/18/19/26 的新按钮会直接
消费该组件，本票把地基打好）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 22）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T15 — 排版密度 + 字号校准（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-15-density-calibration -b t15-density-calibration main
cd .worktrees/wt-15-density-calibration && npm install
```

```text
/implement .scratch/picode-1-1/issues/15-transcript-density-calibration.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
对照基准：ZCode 实机（操作者已授权打开 ZCode 取证）+ 归档截图
.scratch/compare/。你当前在 worktree 分支 t15-density-calibration。

流程第一步是落地最小复现：固定 markdown 样本（列表/段落/代码块/引用）在
dev 转录区截图归档，标出异常间距（高嫌疑：.msg 的 pre-wrap 泄漏进 .md，
react-markdown 块间换行被渲染成空行）。修完后同一样本与 ZCode 实机并排
对照；字号/行高/间距 token 一并校；信息结构零变化（visual:transcript
全套重拍 + DOM 签名断言）。视觉对照是人工关卡，需操作者过目。

流程：Status→claimed → 复现→修→对照 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 15）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T16 — 转录块级供面（W2，阻塞：22 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-16-transcript-affordances -b t16-transcript-affordances main
cd .worktrees/wt-16-transcript-affordances && npm install
```

```text
/implement .scratch/picode-1-1/issues/16-block-level-copy.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
ZCode 基准实拍 .scratch/compare/z-ref-codecell-zoom.png（代码格）与
z-table-hover.png（表格四钮，本票做三钮：复制/预览表格/展开表格滚动区域）。
你当前在 worktree 分支 t16-transcript-affordances。

核心：markdown 渲染器以 components 覆写注入代码格卡片（语言标签行 +
自动换行 toggle + 复制）与表格容器卡（三钮 + hover 短文案——用票 22 的
统一组件）；按钮状态容忍流式重挂载不闪烁；消息操作行加 🔀fork（既有
fork_session 契约，点击自动切换新会话 + toast）。下载/终端钮/👍👎⚓ 不做。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 16）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T23 — 回合折叠（W2，阻塞：14 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-23-turn-collapse -b t23-turn-collapse main
cd .worktrees/wt-23-turn-collapse && npm install
```

```text
/implement .scratch/picode-1-1/issues/23-turn-collapse.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
ZCode 对照实拍 .scratch/compare/z-turn-collapse-expanded.png（展开态）与
/tmp/cur.png（默认收起态）。你当前在 worktree 分支 t23-turn-collapse。

核心：每回合独立一行「Working · Ns ›」折叠容器——live 流式展开实时滚动、
落定自动收起；错误回合保持展开；展开态不跨切换记忆；折叠行内技能标记行
（嗅探用户消息 <skill name="…"> 注入，grilling R2-Q2 选 B）。回放回合同样
折叠（消费票 14 的结构化条目）。reducer 表驱动：回合边界/收起/例外/记忆。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 23）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T24 — Follow 升级 + Open 转正（W2，阻塞：14 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-24-follow-takeover -b t24-follow-takeover main
cd .worktrees/wt-24-follow-takeover && npm install
```

```text
/implement .scratch/picode-1-1/issues/24-follow-upgrade-takeover.md

规矩：CONTEXT.md 是术语权威（Live Follow / Handoff 语义）；1.1 spec 在
.scratch/picode-1-1/spec.md；取证实拍 .scratch/compare/pi-follow-raw-markdown.png
（现状纯文本裸露）。你当前在 worktree 分支 t24-follow-takeover。

核心：FollowView 消费票 14 的结构化条目 → markdown + 折叠态思考/工具渲染
（严格零写入不变）；非活跃（>120s 无写入）出「Open」，点击瞬间重查活跃态——
仍活跃 toast 拒绝，否则既有 resume 链路完整打开（自动切换）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 24）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T17 — 开台芯片（W3，无阻塞；可与 18/20 并行）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-17-newtask-chips -b t17-newtask-chips main
cd .worktrees/wt-17-newtask-chips && npm install
```

```text
/implement .scratch/picode-1-1/issues/17-newtask-context-chips.md

规矩：CONTEXT.md 是术语权威（Task/新任务空态语义）；1.1 spec 在
.scratch/picode-1-1/spec.md；ZCode 基准实拍 /tmp/newtask.png（空态芯片）与
/tmp/chip-dd.png（下拉：搜索工作区+最近列表+底部打开文件夹）。
你当前在 worktree 分支 t17-newtask-chips。

核心：⌘N/New Task → 新任务空态（不弹系统选目录）；项目芯片默认 = 当前
活动会话项目，回落上次使用 → 最近首位；下拉结构照 ZCode；`ask` 设置退役、
替换为「新任务默认项目」选择器；首条消息（文本+图片）经 pending 链路送达。
默认项目解析器做成纯函数（vitest 表驱动）。分支芯片/远程连接/项目外模式
不做。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 17）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T18 — 终端底部停靠（W3，阻塞：22 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-18-terminal-bottom-dock -b t18-terminal-bottom-dock main
cd .worktrees/wt-18-terminal-bottom-dock && npm install
```

```text
/implement .scratch/picode-1-1/issues/18-terminal-bottom-dock.md

规矩：CONTEXT.md 是术语权威（Bridge 单向观察）；ADR-0004 不变（PTY+桥接
决策不动，仅停靠形态）；1.1 spec 在 .scratch/picode-1-1/spec.md；ZCode
⌘J 实拍 /tmp/term-j.png。你当前在 worktree 分支 t18-terminal-bottom-dock。

核心：Terminal 从右侧栏迁出 → VS Code 式底部 dock（全宽、可拖高）；⌘J +
右上切换钮双入口；面板头标签条照 ZCode；Bridge 投屏窗格随迁（零写入语义
不变）；右侧栏 picker 收缩为审查单卡；启动默认收起。PTY 后端零改动
（Seam-3 fake-pty 测试迁移 + 新布局 reducer 单测）。切换钮 tooltip 用
票 22 的统一组件。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 18）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T20 — 多活动会话·核心（W3，建议 14 已合入；**先写 ADR-0006**）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-20-multi-active-sessions -b t20-multi-active-sessions main
cd .worktrees/wt-20-multi-active-sessions && npm install
```

```text
/implement .scratch/picode-1-1/issues/20-multi-active-sessions.md

规矩：CONTEXT.md 是术语权威；ADR-0003（β 形状）与 ADR-0006（本票要先写：
推翻 α 交付形态，docs/adr/0006-*.md 先落盘再动工）；1.1 spec 在
.scratch/picode-1-1/spec.md。你当前在 worktree 分支
t20-multi-active-sessions。

核心：supervisor 从"替换语义"改"注册表语义"——切走不杀 host、后台事件
持续收集、切回重挂载追平实时流；渲染层新增会话注册表纯模块（sessionId →
视图状态 + 焦点路由，chat reducer 原样复用）；退出全终止无孤儿；崩溃隔离
回归（任一 host 崩仅该会话报错）。侧栏状态点固定槽位（动画/绿/空）+
标题左缘全线对齐。边界（已定稿）：切回完整可交互；不设数量上限；两端
并发写不仲裁。后台审批 UX 在票 25，不要越界。

流程：Status→claimed → ADR-0006 → TDD → 全英文文案 → code-review →
提交当前分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 20）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T19 — 分组悬停：隐藏 / 新建任务（W4，阻塞：17、22 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-19-group-hover-actions -b t19-group-hover-actions main
cd .worktrees/wt-19-group-hover-actions && npm install
```

```text
/implement .scratch/picode-1-1/issues/19-sidebar-group-hover-actions.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
ZCode 基准实拍 .scratch/compare/z-hover-group-zoom.png（三钮形态）与
z-menu-group-more.png（⋯ 菜单「× 移除」）。你当前在 worktree 分支
t19-group-hover-actions。

核心：分组行悬停出现操作钮（含空分组态）：① 隐藏分组——本地偏好可恢复
（设置页「隐藏的项目」），会话文件零改动，被隐藏分组的会话仍可被 ⌘K 与
Groups 全部视图命中（隐藏过滤做成纯函数）；② 新建任务——以分组 cwd 预选
芯片的新任务态（票 17 形态）。「查看文件」钮在票 26 加入，本票先出两钮；
按钮 tooltip 用票 22 统一组件。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 19）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T25 — 后台会话审批 UX（W4，阻塞：20 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-25-background-approval -b t25-background-approval main
cd .worktrees/wt-25-background-approval && npm install
```

```text
/implement .scratch/picode-1-1/issues/25-background-approval-ux.md

规矩：CONTEXT.md 是术语权威（审批闸门语义见票 05 交付）；1.1 spec 在
.scratch/picode-1-1/spec.md。你当前在 worktree 分支
t25-background-approval。

核心：后台会话撞上审批闸门 → 药丸留在该会话内挂起等待（绝不自动批准）；
侧栏该会话亮橙色待审批角标；系统通知（点击跳转该会话）；切回后批/拒与
前台一致（approve+remember / deny 链路回归）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 25）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T21 — 分支只读展示（W4，无阻塞；优先级最低）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-21-branch-readout -b t21-branch-readout main
cd .worktrees/wt-21-branch-readout && npm install
```

```text
/implement .scratch/picode-1-1/issues/21-branch-readout.md

规矩：CONTEXT.md 是术语权威；ADR-0003（渲染层不直接跑 git）；1.1 spec 在
.scratch/picode-1-1/spec.md。你当前在 worktree 分支 t21-branch-readout。

核心：host 增只读 IPC 命令 get_branch（git rev-parse --abbrev-ref HEAD，
非 git 目录优雅降级返回 null）——契约纯增量；UI 在会话标题栏项目旁展示
分支名（只读，不做切换）；会话/工作区切换时刷新。Pi 会话不绑定分支是
既定事实，只读是 grilling 定死的边界。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 21）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T26 — 侧栏文件浏览器（W5，阻塞：19 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-26-sidebar-file-browser -b t26-sidebar-file-browser main
cd .worktrees/wt-26-sidebar-file-browser && npm install
```

```text
/implement .scratch/picode-1-1/issues/26-sidebar-file-browser.md

规矩：CONTEXT.md 是术语权威；1.1 spec 在 .scratch/picode-1-1/spec.md；
ZCode 实测形态 .scratch/compare/（vf2.png：返回任务+搜索+标题栏+文件树）。
你当前在 worktree 分支 t26-sidebar-file-browser。

核心：票 19 的悬停框架加入第三钮「查看文件」→ 整个侧栏切换为该项目文件
浏览器：「← 返回任务」+ 项目名标题栏 + 文件树（目录懒加载复用既有目录
读取通道；类型图标；含 .git/.idea 等隐藏条目）；点击文件 → File Preview
打开；「返回任务」一键恢复任务列表。文件搜索后置 1.1。tooltip 用票 22
统一组件。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 26）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## 附：完成后验收（操作者手工环节）

1. 合并前在 worktree 里跑 `npm run dev` 亲自过目该票行为（密度票务必与
   ZCode 实机并排对照）；
2. 合并：`cd ~/PiCode && bash scripts/merge-ticket.sh <NN>`（脚本会做
   rebase + no-ff 合并 + typecheck/tests 验证）；或交给 T00 合并会话；
3. 清理已合并票：`git worktree remove .worktrees/wt-<NN>-* && git branch -d t<NN>-*`
   （先 cd 出该 worktree）；
4. 有其他活跃 worktree 时逐个 `git rebase main`；
5. 票 Status 已是 ready-for-human → 验收满意后改 `resolved`（T00 也会代改）。
