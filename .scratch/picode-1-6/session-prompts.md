# PiCode 1.6 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-6/spec.md`（R1–R13 决议与验收口径；**每条 R 1:1 映射一票，68–80**）。
> 需求定稿全记录（13 痛点 × Q1–Q12 两轮 + file:line 根因 + 会话库取证 + 图片回填拍板）：`.scratch/picode-1-6/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi16-*`（十三帧）。
> 术语新增（草稿 → 票 74；上下文圆环 → 票 77；回合文件条 → 票 78；编辑重发 → 票 79；技能卡 → 票 72）随票入 CONTEXT.md。
> 本批 4 个 additive 契约/投影增量：77 contextWindow、80 accessMode、78 工具 diff 投影、79 用户条目图片投影——**实施时报备入 host-contract smoke**。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.6 全部票未开工时点，当前 main @ 05a97c4 = v1.5.0 + 1.6 spec/tracker/issues）
git tag -a picode-1-6-base -m "1.6 baseline: 1.5.0 shipped + 1.6 spec/tracker" main
# ② merge-ticket.sh 的 Status 门槛补 picode-1-6（50 行 ls-files 追加一段，1-2/1-3/1-4/1-5 同款惯例）
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

## 波次表（5 波；每波 ≤3 并发，遵守 AGENTS.md serialization）

| 波次 | 工单 | 碰撞面要点 | 阻塞 |
|---|---|---|---|
| **W1** | **68** 菜单触发面修订（Lane A 头） | Composer 键盘/触发 + Seam-1 决策表 | 无 |
| | **73** New Task 死端修复（Lane B 头） | App 会话行打开路径 | 无 |
| | **75** 吸底方向感知 | scroll-stay 纯模型 + ChatView | 无 |
| **W2** | **69** 滚动跟随+键盘统一 | 菜单键盘单处实现 | **68** |
| | **74** 草稿保留（**CONTEXT.md 词条 rider**） | 注册表视图状态 + App + EmptyState | **73** |
| | **76** 已配置置顶 | 设置窗 + 模型菜单排序纯函数 | 无 |
| **W3** | **70** chip 弹层竞态 | 弹层 mousedown 豁免 | **69** |
| | **77** 上下文圆环（**additive** contextWindow · **CONTEXT.md 词条 rider**） | 模型目录载荷 + 环投影 + hover 弹卡 | 无 |
| | **78** 回合文件条（**additive** diff 投影 · **CONTEXT.md 词条 rider**） | 转录投影 + 常显段渲染 + 侧板回合 diff 标签 | 无 |
| **W4** | **71** @ 候选集升级 | host 候选集（git ls-files）+ 提示行 | **70** |
| | **79** 编辑重发（**additive** 图片投影 · **CONTEXT.md 词条 rider**） | 用户行 Edit + navigate 预填 + 分叉 toast | **78** |
| | **80** New Task 权限链（**additive** accessMode） | EmptyState pick 链 + 创建载荷 | **74** |
| **W5** | **72** 技能/模板卡（**CONTEXT.md 词条 rider**） | composer 值结构「卡+文本」 | **71**（68/69 为基座） |

> Lane A（68→69→70→71→72）全落 Composer/menus/list-menus/shared-composer 同文件群——严格串行；Lane B（73→74→80）App/EmptyState/注册表串行（80 被 74 挡是 EmptyState 文件冲突规避边）；Lane D（78→79）转录投影+行渲染串行；75/76/77 零阻塞独立线。

**防冲突纪律**（同 v1.1–v1.5，三件事）：
1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
2. contract / app.css / CONTEXT.md / smoke.ts **只增不改**（追加自己的区段/词条/阶段，不动别人行）；
3. 同波票撞同一热点函数 = 停下回报操作者。

**铁律（每张票验收项内嵌，会话自查闭环）**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke / visual harness——跑之前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程；撞锁（端口占用 / 单实例锁失败）= 有会话在跑，等待重试不并跑。其余 worktree 只跑 vitest + typecheck + lint。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-6/issues/
本批波次表：.scratch/picode-1-6/session-prompts.md 的「波次表」节
基线：tag picode-1-6-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。
开场先自查：scripts/merge-ticket.sh 的 Status 门槛必须已含 picode-1-6 目录
（操作者已按手册「开工前一次性准备」② 补入——验证 50 行含 ".scratch/picode-1-6/issues/${NN}-*.md"）。
本批 4 个 additive 增量（77 contextWindow / 80 accessMode / 78 diff 投影 / 79 图片投影）——
合并时核对票内「实施时报备入账」项已进 host-contract smoke。

职责循环（操作者说「合并 NN」时）：
1. 读 .scratch/picode-1-6/issues/NN-*.md，确认 Status: ready-for-human、Comments 有实现 sha。
2. bash scripts/merge-ticket.sh NN（脚本内建 rebase + merge --no-ff + 验证）。
3. 合并后向全部活跃 worktree 广播「rebase main」提醒（操作者转达或你在 Notes 记录）。
4. CONTEXT.md 词条 rider 到票的（74/72/77/78/79）：核对词条已随票入册，缺失则退回。
出现冲突/验收疑义：停下升级操作者，不自行裁断。
```

---

## T68 — 菜单触发面修订（W1，无阻塞 · Lane A 头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-68-menu-trigger -b t68-menu-trigger main
cd .worktrees/wt-68-menu-trigger && npm install
```

```text
/implement .scratch/picode-1-6/issues/68-composer-menu-trigger-surface.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.6 总 spec 在
.scratch/picode-1-6/spec.md。你当前在 worktree 分支 t68-menu-trigger。

核心：① 触发面收敛为纯函数决策（Seam-1 表驱动）——菜单只在光标位于首行行首
token 内时开；换行（Enter/Shift+Enter）/空格/光标移出 token 即关；斜杠与 @ 同表。
② 零匹配不渲染菜单（"No matching commands/files" 常驻框消失），Enter 落回发送
路径，未知命令照旧透传 SDK。③ 菜单键盘 Enter 分支补 shiftKey 守卫——Shift+Enter
任何菜单态永远换行（操作者实锤被拦截直发的病源）。

注意：本票是 Lane A 头（69 键盘统一/70 弹层竞态/71 @ 候选集/72 技能卡都踩你的
基座）——handler 重写时留清晰接缝。纯 renderer 零契约增量。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 68）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T69 — 滚动跟随+键盘统一（W2，Blocked by 68）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-69-menu-scroll -b t69-menu-scroll main
cd .worktrees/wt-69-menu-scroll && npm install
```

```text
/implement .scratch/picode-1-6/issues/69-menu-scroll-keyboard-unify.md

规矩：同 T68（spec .scratch/picode-1-6/spec.md；分支 t69-menu-scroll）。

核心：① 菜单选中行 scrollIntoView(nearest)——键盘导航灰底行永不移出可视区
（对照 pi16-menu-no-scroll）。② composer 文本菜单与弹层两套键盘处理统一为
一处实现（一处管 clamp/取模，消除双轨——现实际生效的是 ArrowDown 无界版）。
③ 四类菜单（斜杠/文件/权限/模型/思考）键盘行为一致；hover 同一选中模型不回归。

注意：你踩 68 重写后的路径——开工前 rebase main 拿到 68 的基座。
流程同 T68（merge-ticket.sh 69）。
```

---

## T70 — chip 弹层竞态（W3，Blocked by 69）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-70-chip-toggle -b t70-chip-toggle main
cd .worktrees/wt-70-chip-toggle && npm install
```

```text
/implement .scratch/picode-1-6/issues/70-chip-popover-toggle-race.md

规矩：同 T68（分支 t70-chip-toggle）。

核心：弹层 document mousedown 外点关闭豁免 owning chip——点 chip 本体不再
「mousedown 先关 → click toggle 又弹开」；三 chip（权限/模型/思考）再点必收、
真外点仍关、弹层内点击不误关。实现形态票内裁量。

流程同 T68（merge-ticket.sh 70）。
```

---

## T71 — @ 候选集升级（W4，Blocked by 70）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-71-at-candidates -b t71-at-candidates main
cd .worktrees/wt-71-at-candidates && npm install
```

```text
/implement .scratch/picode-1-6/issues/71-at-mention-candidates.md

规矩：同 T68（分支 t71-at-candidates）。

核心：① host 候选集——cwd 在 git 仓库内用 git ls-files（只读，branch_info
先例；零写入红线），非 repo 维持 walk+cap；cap 截断时候选尾附 "truncated" 提示行。
② @ 与斜杠共用 68 触发面规则。③ 插件/会话分类不做（Pi 无消费面——MCP 出局
同款纪律，操作者已拍板）。

注意：host 侧改动走 host-contract smoke 两态验证；renderer 匹配/排名不动。
流程同 T68（merge-ticket.sh 71）。
```

---

## T72 — 技能/模板卡（W5，Blocked by 71 · Lane A 收官）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-72-skill-card -b t72-skill-card main
cd .worktrees/wt-72-skill-card && npm install
```

```text
/implement .scratch/picode-1-6/issues/72-skill-template-card.md

规矩：同 T68（分支 t72-skill-card）。

核心：① composer 值升级「卡+文本」结构——选中技能/prompt 模板渲染卡
（icon+名+×，对照 pi16-zcode-skill-card），单槽+替换，参数跟卡后，发送重组
/skill:name args 逐字节等价（纯渲染层）。② skill: 前缀可剥匹配（手打可搜）。
③ builtin（/compact）立即执行路径不变；prompt 模板同待遇；New Task 共组件同规则。

注意：你踩 68（触发面——卡在场时输入 / 开替换菜单）与 69（键盘——Enter 出卡）
的基座；输入路径零 setState 纪律（票 49 先例）不得破。
术语 rider：「技能卡（Skill Card）」入 CONTEXT.md。
流程同 T68（merge-ticket.sh 72）。
```

---

## T73 — New Task 死端修复（W1，无阻塞 · Lane B 头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-73-newtask-switch -b t73-newtask-switch main
cd .worktrees/wt-73-newtask-switch && npm install
```

```text
/implement .scratch/picode-1-6/issues/73-newtask-deadend-fix.md

规矩：CONTEXT.md 术语权威；ADR 0001–0006 有效（0006 注册表语义）；spec 在
.scratch/picode-1-6/spec.md。分支 t73-newtask-switch。

核心：会话行打开路径「已聚焦」「在应用内」两分支补清 New Task 态标志——
New Task 态点任何会话行（活 host/已聚焦/需 resume 三类）主区必达目标会话。
跟随/resume/灰行 toast 路径不回归。

注意：本票是 74（草稿保留）的验收前提——切换必达后草稿才谈得上保留。
纯 renderer 状态修，零契约增量。
流程同 T68（merge-ticket.sh 73）。
```

---

## T74 — 草稿保留（W2，Blocked by 73）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-74-draft-preserve -b t74-draft-preserve main
cd .worktrees/wt-74-draft-preserve && npm install
```

```text
/implement .scratch/picode-1-6/issues/74-composer-draft-preservation.md

规矩：同 T73（分支 t74-draft-preserve）。

核心：草稿（文本+已贴图片）内存级保留——per-session 草稿槽（会话视图注册表
扩展）+ New Task 单槽（App 层）；切走切回恢复；发送自然清空；空槽不存；重启即失
（操作者拍板）。与 73 联合验收：切走必达 + 切回草稿在。

注意：EmptyState 与注册表视图状态都动——80（New Task 权限链）排你后面合。
术语 rider：「草稿（Composer Draft）」入 CONTEXT.md。
流程同 T68（merge-ticket.sh 74）。
```

---

## T75 — 吸底方向感知（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-75-stick-direction -b t75-stick-direction main
cd .worktrees/wt-75-stick-direction && npm install
```

```text
/implement .scratch/picode-1-6/issues/75-streaming-stick-direction.md

规矩：同 T73（分支 t75-stick-direction）。

核心：scroll-stay 决策表扩展 heldAway 输入——向上滚动手势置位、回底/自发送/
跳转复位；置位期间内容增长绝不拽人（票 45「内容增长不拽人」本意的补全）；
160px 阈值收窄为回底钮显隐专用。仅 ChatView（票 45 同界，FollowView 不做）。

注意：Seam-1 决策表全组合 + electron smoke 流式场景；零额外渲染红线。
流程同 T68（merge-ticket.sh 75）。
```

---

## T76 — 已配置置顶（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-76-providers-first -b t76-providers-first main
cd .worktrees/wt-76-providers-first && npm install
```

```text
/implement .scratch/picode-1-6/issues/76-configured-providers-first.md

规矩：同 T73（分支 t76-providers-first）。

核心：设置窗 Models 节 + composer 模型菜单同规则——已配置在前、未配置在后、
组内字母序；当前 provider 定位高亮保持；模型列不重排。渲染层 join 既有凭据
探测报告，零新契约。

流程同 T68（merge-ticket.sh 76）。
```

---

## T77 — 上下文圆环（W3，无阻塞 · additive 增量）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-77-context-ring -b t77-context-ring main
cd .worktrees/wt-77-context-ring && npm install
```

```text
/implement .scratch/picode-1-6/issues/77-context-ring.md

规矩：同 T73（分支 t77-context-ring）。

核心：① 模型 chip 左侧圆环 = 最近 assistant usage（input+cacheRead+cacheWrite
+output 全计入）/ contextWindow；② hover 数据弹层：百分比+used/limit+四元组+
缓存命中率（对照 pi16-context-ring-hover）；③ 无 usage 灰环无 hover；④ ZCode
分类分解不做（会话文件无此记账——数据源如实）；⑤ 仅 ChatView。
additive 增量：模型引用 contextWindow? 字段（实施时报备入 host-contract smoke，
旧载荷兼容）。

注意：分子口径实施期与 Pi TUI 同场景校准，结果留档 ticket comment。
术语 rider：「上下文圆环（Context Ring）」入 CONTEXT.md。
流程同 T68（merge-ticket.sh 77）。
```

---

## T78 — 回合文件条（W3，无阻塞 · additive 增量）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-78-turn-filebar -b t78-turn-filebar main
cd .worktrees/wt-78-turn-filebar && npm install
```

```text
/implement .scratch/picode-1-6/issues/78-turn-file-changes-bar.md

规矩：同 T73（分支 t78-turn-filebar）。

核心：① 每回合常显段末尾「N files changed +X −Y」折叠/展开（对照
pi16-zcode-turn-filebar / -expanded）；② 数据 = 回合内 edit/write 聚合——
edit ± 从工具结果 diff 文本解析、write "+new"、同文件合并、read/ls 排除、
无更改回合不出条；③ Review = 侧板回合 diff 标签（复用既有 diff 渲染器，
回合 diff 非 git diff）；Open = 既有预览深链；④ live 与落定同构。
additive 增量：转录条目/live 事件带工具结果 diff 文本（报备入账）。

注意：撤销钮不做（1.1 纪律）；常显段渲染与 79（用户行 Edit）邻接——你先合。
术语 rider：「回合文件条（Turn File Changes）」入 CONTEXT.md。
流程同 T68（merge-ticket.sh 78）。
```

---

## T79 — 编辑重发（W4，Blocked by 78 · additive 增量）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-79-edit-resend -b t79-edit-resend main
cd .worktrees/wt-79-edit-resend && npm install
```

```text
/implement .scratch/picode-1-6/issues/79-edit-and-resend.md

规矩：同 T73（分支 t79-edit-resend）。

核心：① 落定用户消息 hover「Edit」→ navigate_tree 移叶父 entry（同文件无损、
天然 No summary）+ composer 预填原文+原图（图片从用户条目图片部件还原附件态——
操作者拍板图片也回填）→ 发送原位分叉新分支 + 轻 toast（fork-toast 先例）；
② agentRunning 隐藏；点 Stop 后 agent_end 落地即复现（验收写死）；③ 全部落定
user 消息可编辑（含 steer/follow-up）；草稿在位直接替换；④ 旧分支树面板可达。
additive 增量：用户条目图片部件投影（报备入账）。

注意：你踩 78 的投影基座；预填走 74 的草稿槽路径（直接替换语义）。
术语 rider：「编辑重发（Edit & Resend）」入 CONTEXT.md。
流程同 T68（merge-ticket.sh 79）。
```

---

## T80 — New Task 权限链（W4，Blocked by 74 · additive 增量）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-80-access-chain -b t80-access-chain main
cd .worktrees/wt-80-access-chain && npm install
```

```text
/implement .scratch/picode-1-6/issues/80-newtask-access-chain.md

规矩：同 T73（分支 t80-access-chain）。

核心：EmptyState 增 accessPick 本地态（chip 即显，票 41 model/thinking pick
同型——现在权限 onPick 透传 sendFocused 被静默丢弃）；随任务创建参数下传生效；
未选 = fallback + "default" 小标；跨重启不持久。
additive 增量：会话默认值结构 accessMode? 字段（报备入账，旧载荷兼容）。

注意：EmptyState 与 74（草稿槽）同文件——74 先合，你 rebase 后开工。
流程同 T68（merge-ticket.sh 80）。
```

---

## 批次收尾（全部票合入后，操作者）

```bash
cd ~/PiCode
npm test && npm run smoke          # 全量兼容套件（含真实模型调用，serialization 独占）
npm run package:verify             # 发布前打包验证
git tag -a v1.6.0 -m "1.6.0 (composer menu overhaul, skill cards, context ring, turn file bar, edit & resend, draft preservation, newtask fixes)" main
cp .scratch/picode-1-6/session-prompts.md .scratch/archive/session-prompts-v1.6.md  # 手册归档（收尾惯例）
```

版本事实自查（发布前）：内嵌 SDK ↔ 全局 pi 版本对齐（ADR-0005；1.5 时点 0.85.1）——若 npm/全局 pi 有新版，重走 SDK 对齐检查点后再打 tag。
