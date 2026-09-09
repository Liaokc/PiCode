# PiCode 1.4 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-4/spec.md`（R0–R5 决议与验收口径）。
> 需求定稿全记录（Q1–Q13 + ZCode 取证参数 + file:line 根因）：`.scratch/picode-1-4/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi14-*`（五帧）。
> 术语新增（输入展开 → 票 49；回合正文 / 过程叙述 → 票 53）随票入 CONTEXT.md。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.4 全部票未开工时点，当前 main @ 8b7bb8b）
git tag -a picode-1-4-base -m "1.4 baseline: 1.3.0 shipped + 1.4 spec/tracker" main
# ② merge-ticket.sh 的 Status 门槛补 picode-1-4（1-2/1-3 批同款惯例，勿再绕）：
#    scripts/merge-ticket.sh 第 50 行 ls-files 列表加入 ".scratch/picode-1-4/issues/${NN}-*.md"
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

## 波次表（3 波，同波热点文件规则见「防冲突纪律」）

| 波次 | 工单 | 碰撞面要点 | 阻塞 |
|---|---|---|---|
| **W1** | **48** SDK 对齐升级（三段式，**含操作者检查点，票内暂停**） | package.json/lockfile + 可能的最小适配面；**侦察结论是 51/52 的基准** | 无 |
| | **49** Composer 自适应 | Composer + app.css **composer 段** + **CONTEXT.md 词条 rider** | 无 |
| | **50** 代码卡标签回退 | Markdown 代码卡 + app.css **代码卡段**（如需） | 无 |
| **W2** | **51** fork live 修复 | contract + host + chat-reducer + App toast | 48 |
| | **53** 回合正文分割 | turn-collapse + TurnContainer/AnswerBlock/FollowView + **CONTEXT.md 词条 rider ×2** | 48 |
| **W3** | **52** 空态命令目录 | auth-probe + main 重探 + EmptyState 接线 + probe 报告契约 | 48、51 |

> W1 三票无共享热点（48 基本只动依赖锁；49/50 的 app.css 区段不相交）。W2 的 51 与 53 **无文件交集**，可并行；两者都可能给 smoke.ts 追加阶段——按惯例**只增不改**，合并时自动排齐。52 的 contract 增量（probe 报告字段）与 51 的契约增量（事件 id 字段）**落点不同文件**，串行边是双保险。

**防冲突纪律**（同 v1.1/v1.2/v1.3，三件事）：
1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
2. contract / app.css / CONTEXT.md / smoke.ts **只增不改**（追加自己的区段/词条/阶段，不动别人行）；
3. 同波票撞同一热点函数 = 停下回报操作者。

**铁律**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke（48 的互通冒烟、53/49 的 electron smoke 都在此列）；其余 worktree 只跑 vitest + typecheck。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-4/issues/
本批波次表：.scratch/picode-1-4/session-prompts-v1.4.md 的「波次表」节
基线：tag picode-1-4-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。
开场先自查：scripts/merge-ticket.sh 的 Status 门槛必须已含 picode-1-4 目录——
若操作者还没改，先提醒其改完（或经其授权由你改，一行 ls-files 追加）再开始合并职责。

职责循环（操作者说「合并 NN」时）：
1. 前置检查：票文件 Status 必须是 ready-for-human；对应 worktree 必须干净
   （不干净先甄别：harness 产物按证据规则处置，见下）。
2. merge-gate 簿记：main 上的票文件若还是旧状态，用 git checkout <branch> -- <票文件>
   原样取分支终态到 main 提交 sync——必须原样取分支版本，分支自己的 tracker
   提交 rebase 时会自动去重/零冲突。
3. 若操作者未明说已验收：提醒其先在 worktree 跑 npm run dev 目检
   （dev-app serialization 铁律），得到明确「已验收」再继续。
   特例——票 48 的验收 = 操作者对侦察清单拍板（票内检查点留痕）+ 全门禁绿。
4. 执行 bash scripts/merge-ticket.sh NN。rebase/合并冲突按性质分级：
   - tracker 状态对撞 → 例行，取 main 侧（HEAD）；
   - package-lock.json → 取任一侧后 npm install 再生再 add（48 合入后其余票必遇，照此办）；
   - 契约 / IPC 注册 / 导入行 / app.css 追加区段 / CONTEXT.md 词条 / smoke.ts 追加阶段
     → 双方保留（只增不改）；
   - 二进制 PNG → 取更新的一次重拍；两张都过时则取后合入侧并在 tracker 注明待重拍；
   - 语义级（同波票撞同一热点函数/规则块）→ 不许自作主张：git rebase --abort
     恢复干净，向操作者报告冲突文件 + 双方意图 + 整合指令草案，退回所属工单会话
     （先例模式：该会话 rebase main 自行整合 → 重跑验证门 → 二次验收 → 我重合）。
5. 合并后终态审计：抽查关键接缝是否在 main 上幸存（CONTEXT 词条 / app.css 区段 /
   纯函数套件 / smoke 阶段 / 无冲突标记残留）；确认 typecheck + tests 绿（脚本已跑，
   报出确切测试数）。48 合入后报出内嵌 SDK 实装版本（package.json）。
6. tracker：Status 改 resolved，## Comments 追加 merge sha、验收口径、冲突处置记录。
7. 清理：git worktree remove .worktrees/wt-NN-* && git branch -d tNN-*；提醒其他
   活跃 worktree rebase main（附对撞面预判）。
8. 向操作者播报：本次合并解锁了哪些新工单（波次表）。

证据规则（worktree 里未跟踪/改动的截图）：
- 票特有新帧（新 harness 场景输出、49 展开态帧、53 长回合帧、50 裸围栏帧等）→ 入库；
- 既有帧被重拍且属本票功能面、无更近的覆盖重拍 → 入库；
- 既有帧被重拍但即将被下一张票覆盖 → git restore 丢弃；
- 跨票回归验证产物 → 入库并在提交信息注明用途。

收官发布（操作者说「发布 vX.Y.Z」时）：
1. 手册归档（照 v1.0–v1.3 先例，chore 提交到 .scratch/archive/）；
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

操作者对它只需说：「合并 NN」「已验收」「拍板（票 48 检查点）」「发布 vX.Y.Z」「（冲突时）已通知 XX 会话整合」。

---

## T48 — SDK 对齐升级 0.84.3→0.85.1（W1，无阻塞 · 三段式含暂停）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-48-sdk-upgrade-0851 -b t48-sdk-upgrade-0851 main
cd .worktrees/wt-48-sdk-upgrade-0851 && npm install
```

```text
/implement .scratch/picode-1-4/issues/48-sdk-upgrade-0851.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效（本票执行 ADR-0005）；
1.4 总 spec 在 .scratch/picode-1-4/spec.md。你当前在 worktree 分支
t48-sdk-upgrade-0851。这是三段式票，第二段必须停下等操作者：

① 侦察（先做）：diff 0.84.3（PiCode node_modules 现装）→ 0.85.1（全局 pi 同版
   可对照 ~/.nvm/.../node_modules/@earendil-works/pi-coding-agent）。产出清单
   写进票 Comments：host/renderer 消费的 SDK 接口有无签名变化、SessionManager/
   entry/事件语义变化（fork、navigate、事件字段——51/52 两票以你的结论为基准）、
   会话 jsonl 格式兼容性、新增/废弃导出。只读侦察，不动代码。
② 检查点（硬停）：把清单要点播报给操作者，明示「请拍板」。操作者明确同意前
   不得进入③。若实施时 npm 已有 >0.85.1 版本，同样回到本检查点重新拍板，
   绝不自行升目标。
③ 实施（拍板后）：package.json 升锁 0.85.1 + 按清单适配（能不改就不改）+
   typecheck / lint / vitest 全绿 + electron smoke 全链 + 互通冒烟
   （TUI 0.85.1 建会话 → PiCode 打开续写；dev-app serialization 铁律，
   与操作者协调时机）。

流程：Status→claimed → ①②③ → 全英文文案（若有）→ code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 48）→
Status 改 ready-for-human + Comments 记 sha 与拍板留痕。
```

---

## T49 — Composer 自适应（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-49-composer-autogrow -b t49-composer-autogrow main
cd .worktrees/wt-49-composer-autogrow && npm install
```

```text
/implement .scratch/picode-1-4/issues/49-composer-autogrow-expand.md

规矩：CONTEXT.md 是术语权威；1.4 总 spec 在 .scratch/picode-1-4/spec.md；
ZCode 校准参数（自动增高 40→160px、scrollHeight 钳制式、无展开钮——展开钮是
操作者批准的偏离）见票内背景与 intake-grilling.md。你当前在 worktree 分支
t49-composer-autogrow。

核心：① 自动增高——高度投影纯函数（内容 → 高度钳制 [74px, 160px]，
scrollHeight 测量 + 节流，禁 per-keystroke setState 风暴），超出封顶内部
滚动；② 展开钮——输入卡右上角常驻图标钮（操作者拍板位置，非 footer），
tooltip 只显 "Expand input"（无快捷键，Tooltip 纪律）；展开态组件本地
不持久化；展开高度 = 主区约一半钳制 [280px, 560px]，原位下推转录非浮层；
收回三路 = 再点 / Esc / 发送成功后。两处 composer（New Task / 会话内）
共组件自动同享——只动 Composer 组件与 app.css composer 段，不碰转录/滚动
逻辑（那是 45/46 已交付面）、不碰 EmptyState chips。

流程：Status→claimed → TDD（投影/状态机表驱动，Seam-1）→ 全英文文案 →
code-review → 提交当前分支（不自行 merge，提示操作者
bash scripts/merge-ticket.sh 49）→ Status 改 ready-for-human + Comments
记 sha。「输入展开（Composer Expand）」词条随票入 CONTEXT.md（措辞见
intake-grilling.md 术语节）。
```

---

## T50 — 代码卡语言标签回退（W1，无阻塞 · 小票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-50-codeblock-text -b t50-codeblock-text main
cd .worktrees/wt-50-codeblock-text && npm install
```

```text
/implement .scratch/picode-1-4/issues/50-codeblock-text-fallback.md

规矩：CONTEXT.md 是术语权威；1.4 总 spec 在 .scratch/picode-1-4/spec.md。
你当前在 worktree 分支 t50-codeblock-text。

核心：代码卡语言标签投影改为缺失回退 "text"（ZCode 同型
language?.trim() || 'text'）；带标签块零回归；卡片 chrome（wrap/copy）
不动、不加文件图标（Q8 拍板最小对齐）。投影纯函数表驱动（Seam-1）；
visual 帧对照 .scratch/compare/pi14-untagged-codeblocks 场景。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 50）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T51 — fork live 路径修复（W2，阻塞：48 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-51-fork-live-entryids -b t51-fork-live-entryids main
cd .worktrees/wt-51-fork-live-entryids && npm install
```

```text
/implement .scratch/picode-1-4/issues/51-fork-live-entryids.md

规矩：CONTEXT.md 是术语权威；1.4 总 spec 在 .scratch/picode-1-4/spec.md；
SDK 已是 0.85.1（48 合入）——host 事件面以它为基准，票 48 Comments 里的
侦察结论先读。你当前在 worktree 分支 t51-fork-live-entryids。

核心双修：① 真实 entry id 回填——host 事件（user_message / message_end）
携带真实会话条目 id（条目落盘时回读；additive 契约字段，实施时报备，
旧载荷校验不破）；reducer 有真实 id 则采用、缺席回退合成 id（被中止回合
等场景健壮性）——表驱动（Seam-1）。② toast ack 制——废除 handleFork 的
无条件乐观成功 toast；成功 toast 挂在 fork 后会话公告到达时；失败走既有
session_command_error 错误 toast。electron smoke：新会话两条回合 → 点
Fork → 分叉成功（parentSession 正确）+ 恰好一条成功 toast + user_message
观察者证零垃圾回合。运行中点 Fork 静默维持（requireSettledSession 不动）；
resume 会话与树面板 fork 零回归。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 51）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T52 — 空态命令目录（W3，阻塞：48、51 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-52-newtask-catalog -b t52-newtask-catalog main
cd .worktrees/wt-52-newtask-catalog && npm install
```

```text
/implement .scratch/picode-1-4/issues/52-newtask-command-catalog.md

规矩：CONTEXT.md 是术语权威；1.4 总 spec 在 .scratch/picode-1-4/spec.md；
SDK 0.85.1 基准（48 侦察结论在票 Comments）；probe 机制先例 = 票 11/41。
你当前在 worktree 分支 t52-newtask-catalog。

核心：① auth-probe 扩展——probe 增 resourceLoader 枚举（prompt 模板 +
技能投影；无会话机制）与 cwd 参数；probe 报告增命令目录字段（additive
报备，旧载荷校验不破）。② main 层——按 New Task 所选 cwd 防抖重探 + 缓存
（同目录一次；目录切换 → 重探）。③ 空态接线——空态 chat 的命令清单消费
该目录：/ 菜单列真实模板+技能（搜索/↑↓ 沿用现组件）；/compact（会话域）
与退役六条不进目录；点选 = 插入命令文本进 composer（与 in-session 同一路径，
不直接发送，首条消息由 SDK 解析）；无模板无技能时菜单如实为空（底纹提示
沿用现样式）。目录投影纯函数表驱动（Seam-1：probe 报告 → 菜单行，含 cwd
维度与排除规则）。electron smoke：空态菜单列真命令、点选插入零发送、
切目录菜单更新。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 52）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T53 — 回合正文分割（W2，阻塞：48 已合入 · 与 51/52 无文件交集）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-53-turn-answer-split -b t53-turn-answer-split main
cd .worktrees/wt-53-turn-answer-split && npm install
```

```text
/implement .scratch/picode-1-4/issues/53-turn-answer-split.md

规矩：CONTEXT.md 是术语权威；1.4 总 spec 在 .scratch/picode-1-4/spec.md；
ZCode 分段规则（Ant/Tnt：可见正文 = 最后文本行，之前进折叠容器，之后常显）
见票内背景与 intake-grilling.md。你当前在 worktree 分支 t53-turn-answer-split。

核心：groupTurns（三面共享纯模型）分割规则改为——正文 = 回合最后一个文本
part（位置规则，非语义判定）；更早文本 part 成为 work item 新类别「过程
叙述」，随容器折叠（容器展开时按 work 行渲染可见）；正文之后的工具行常显
在正文下方（转写顺序）。容器 live 自动展开 / 结算收起 / 错误回合保持展开
零回归；fork anchor = 最后文本承载 entry（与现状等价，勿动语义）；流式尾
文本作为正文持续可见。ChatView 与 FollowView 同规则（共享模型改动，不加
开关）。分割决策表表驱动（Seam-1：最后文本块/过程叙述/后续工具/流式尾/
错误/无文本回合）。electron smoke：长回合结算后正文仅尾块；visual 帧
对照 .scratch/compare/pi14-narration-in-answer 场景。性能红线：纯模型
改动零额外转录重渲染（票 30/46 memo 先例）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 53）→
Status 改 ready-for-human + Comments 记 sha。「回合正文（Turn Answer）」
「过程叙述（Interim Narration）」两词条随票入 CONTEXT.md（措辞见
intake-grilling.md 术语节）。
```
