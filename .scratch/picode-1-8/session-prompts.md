# PiCode 1.8 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-8/spec.md`（R1–R21 决议与验收口径；**每条 R 1:1 映射进票，116–134**——R4+R5 合 122、R9+R15 合 124；P3 导航轨阈值为现状确认无票）。
> 需求定稿全记录（28 痛点 × 六轮 + Q1–Q9 裁决 + file:line 根因 + History 链路只读实测 + P2 复核）：`.scratch/picode-1-8/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi18-*`（操作者待复制——会话内贴图无法落盘）。
> 术语新增（队列卡 → 票 128 rider）与修订（导航轨锚定规则 → 票 120；Manual 排序沉底 → 票 123；技能卡既有文本共存 → 票 118）随票入 CONTEXT.md。
> 本批 **1 个 additive 契约/投影增量**：128 `reorder_queue_entry`——**实施时报备入 host-contract smoke**。
> 开工硬前提：①**node_modules SDK 0.85.1 → pin 0.86.1 未同步**——跑 dev app / smoke 前必须 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`；②**PiCode 必须以带 nvm PATH 的方式启动**（Finder/Dock 直启会话无法 spawn subagent——票 134 修复前的批次运行前提）：`PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH" open -a PiCode`。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.8 全部票未开工时点，当前 main = v1.7.0 + 1.8 spec/tracker/issues）
git tag -a picode-1-8-base -m "1.8 baseline: 1.7.0 shipped + 1.8 spec/tracker" main
# ② merge-gate 补 picode-1-8（scripts/merge-ticket.sh:50 ls-files 列表现为 1-0…1-7——
#    追加 ".scratch/picode-1-8/issues/${NN}-*.md"；默认操作者执行，授权后 intake 可代补）
# ③ 确认无活跃 worktree 残留：git worktree list
# ④ node_modules 同步（SDK 0.86.1——跑应用通道前必须）
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
# ⑤ 参照帧落盘（多模态票依赖）：把 ZCode provider 卡/思考卡（图6/图7）与
#    队列卡（单条/两条）截图复制入 .scratch/compare/：
#    z18-zcode-provider-card.png / z18-zcode-thinking-brain.png
#    z18-zcode-queue-1.png / z18-zcode-queue-2.png
#    （T122 必需——帧缺席不盲画图标；T128 强烈建议）
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

## 波次表（7 波；每波 ≤3 并发，遵守 AGENTS.md serialization）

| 波 | 票 | 说明 |
|---|---|---|
| W1 | 116 → 117 → 118（A 群强串行）· 120 · 121 · 123 · 126 · 127 | A 群 = composer 群逐票串行；W1 其余独立并行 |
| W2 | 129 · 130 · 133 · 125 · 134 | 独立（134 = spawn 启动修复——对后续批次启动生效，本批运行仍靠操作者启动 workaround） |
| W3 | 122（Blocked by 121）· 124 | 菜单几何在 provider 口径之后 |
| W4 | 119（Blocked by 117）· 128 | 空闲转录门在 composer 滚动族后；queue 重构独立大票 |
| W5 | 131（History 复现定位）· 132（⌘J 复现定位） | 两张定位票随时可插空（与 dev-app serialization 错峰） |
| W6 | 131/132 的修复腿（若与 W4/W5 冲突顺延） | — |
| 收尾 | 全量回归：vitest + smoke:host + smoke:electron + visual 抽帧 | T00 或操作者 |

---

## T116 — 展开态输入高度稳定（W1 · A 群头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-116-expand-height -b t116-expand-height main
cd .worktrees/wt-116-expand-height && npm install
```

```text
/implement .scratch/picode-1-8/issues/116-expand-height-stable.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t116-expand-height。

核心：composer 高度 layout effect 的 typing-commit 路径按 expandState 分流——
展开态输入/删除不缩高（重投影 composerExpandHeight），收起态 auto-grow 74–160
不回归。缩矮唯一触发 = toggle/Esc/⌘E/sent（expand 状态机零改动）。输入路径
零 setState 纪律（票 49）不得破。

注意：本票是 A 群头（117 光标跟随/118 技能保留文本踩你的文件）——改完留清晰
接缝。纯 renderer 零契约增量。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 116）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T117 — composer 光标跟随与 IME 滚动稳定（W1，Blocked by 116）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-117-ime-scroll -b t117-ime-scroll main
cd .worktrees/wt-117-ime-scroll && npm install
```

```text
/implement .scratch/picode-1-8/issues/117-composer-ime-scroll.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t117-ime-scroll，
基于 116 合入后的 main rebase。

核心：①revealComposerCaret 从硬换行计数改视觉行定位（dev app 实测后定实现，
junk 测量防御不回退）；②IME 舞步抖动插桩消除（三场景 × 中英文矩阵 =
第一验收项——拉到底输入/倒数第二行/中下部，「输入不应改变光标位置」）；
③PREFILL_EVENT prefill 后视口滚到光标行（queue Edit 与 edit-resend 共用）。
非中文既有稳定行为零回退。

注意：同文件群 A 群中票（118 踩 Composer.tsx）——留接缝。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 117）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T118 — 技能选中保留既有文本（W1，Blocked by 117）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-118-skill-keep-text -b t118-skill-keep-text main
cd .worktrees/wt-118-skill-keep-text && npm install
```

```text
/implement .scratch/picode-1-8/issues/118-skill-keep-text.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t118-skill-keep-text，
基于 117 合入后的 main rebase。

核心：pickTextMenuRow card 分支只剥离触发 token、余文保留为卡后参数（caret
落余文）；发送重组 composeCommandText 逐字节一致零改动；menu-surface 触发面
不动。CONTEXT.md 技能卡词条修订（既有文本共存）是本票 rider。

注意：A 群尾票；skill-only 空泡消失语义（票 97）不回归。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 118）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T119 — 空闲输入不移动转录（W4，Blocked by 117）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-119-idle-no-move -b t119-idle-no-move main
cd .worktrees/wt-119-idle-no-move && npm install
```

```text
/implement .scratch/picode-1-8/issues/119-idle-input-no-transcript-move.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t119-idle-no-move，
基于 117 合入后的 main rebase。

核心：agent 非运行态 composer 任何操作绝不移动转录（触发源 dev app 插桩 =
第一验收项——静态穷尽未定位，ChatView stick effect 不含 composer 高度、
auto-grow 零 setState）；Copy/Fork 行计入底部目标查证（操作者假设「不算底部」）。
运行态语义零回退：票 93 自发送闩 / 94 折叠锚定 / 75 滚轮赢 / 回底钮显隐。

注意：scroll-stay 纯模型家族纪律——决策收敛纯函数，不散布监听。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 119）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T120 — 导航轨 live 锚定（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-120-rail-anchor -b t120-rail-anchor main
cd .worktrees/wt-120-rail-anchor && npm install
```

```text
/implement .scratch/picode-1-8/issues/120-navigator-live-anchor.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t120-rail-anchor。

核心：navigator-rail 纯模型锚定决策表扩展——吸底（isAtBottom 口径）锚定 =
最新回合（含 live）；非吸底维持探针规则（0.35 不动）。RAIL_MIN_TICKS=2 维持
（Q1 现状确认）。渲染词汇零改动；导航轨仅 ChatView（票 46 口径）。
CONTEXT.md 导航轨词条修订（锚定规则）是本票 rider。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 120）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T121 — New Task provider 列表统一（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-121-providers-configured -b t121-providers-configured main
cd .worktrees/wt-121-providers-configured && npm install
```

```text
/implement .scratch/picode-1-8/issues/121-newtask-providers-configured-only.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t121-providers-configured。

核心：newTaskProviders 从「配置优先排序」收紧为「仅已配置」（复用票 76
configuredIds）；会话内路径零改动；modelMenuHint 三态诚实文案不回归；
设置窗 Models 节维持全列表（票 76 初衷）——边界报备入 Comments。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 121）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T122 — 菜单几何与大脑图标（W3，Blocked by 121）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-122-menu-geometry -b t122-menu-geometry main
cd .worktrees/wt-122-menu-geometry && npm install
```

```text
/implement .scratch/picode-1-8/issues/122-menu-geometry-brain-icon.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t122-menu-geometry，
基于 121 合入后的 main rebase。

核心：①cascade 列高解耦（hover 换 provider 弹层几何不变、model 列内部滚动
——振荡机制 = .cmp-cascade stretch × bottom 锚定）；②弹出左对齐触发 chip
（ZCode 图6/图7 构图，窗口钳制）；③GaugeIcon → 自绘 BrainIcon（几何路径
无字体依赖；ZCode 资产不入库——红线）。票 68/69 键盘模型与 98 焦点纪律
不回归（captureKeys 焦点落选中行）。

参照帧：开工前确认 .scratch/compare/ 已有 z18-zcode-provider-card.png 与
z18-zcode-thinking-brain.png（ZCode 图6/图7）——帧缺席停下向操作者要，
绝不盲画图标。本票需多模态会话（能读图）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 122）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T123 — 死 cwd 组沉底（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-123-dead-group-sink -b t123-dead-group-sink main
cd .worktrees/wt-123-dead-group-sink && npm install
```

```text
/implement .scratch/picode-1-8/issues/123-dead-cwd-group-sink.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t123-dead-group-sink。

核心：group.ts 组排序活性桶——死 cwd 组恒沉底（Updated/Created/Manual 三排序
一致；Q8=含 Manual），Manual 手动序对死组不生效；cwd-liveness 复用（组级）；
灰行（票 2x）与手动排序持久化（票 84）不回退。
CONTEXT.md Manual 排序/筛选下拉词条修订（沉底规则）是本票 rider。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 123）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T124 — 用量页修缮：零用量过滤 + Open task 删除（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-124-usage-polish -b t124-usage-polish main
cd .worktrees/wt-124-usage-polish && npm install
```

```text
/implement .scratch/picode-1-8/issues/124-usage-zero-filter-open-task.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t124-usage-polish。

核心：①零用量过滤（Q3=A 严格 0 token；trend 图例 + donut + 图例共用一个
shared/usage 纯函数；范围切换重投影；全零时图空态如实）；②DrillDown
Open task 按钮 + onOpenTask 布线删除（行纯展示）。ADR-0002 聚合口径
零改动（纯显示层）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 124）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T125 — Token Activity weekly 本周 7 天（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-125-weekly-7days -b t125-weekly-7days main
cd .worktrees/wt-125-weekly-7days && npm install
```

```text
/implement .scratch/picode-1-8/issues/125-token-activity-weekly-7days.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t125-weekly-7days。

核心：weekly 模式重实现 = 本周 7 天（Q4=B；周起始依 ZCode 校准票内裁量）；
零用量日空色格（Daily 模式同修——绝不缺格）；hover tooltip 当日用量
（与 trend/donut 同族）；最左格焦点圈左线裁剪修复；Daily/Cumulative 形态不动。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 125）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T126 — MCP 状态条边框分离（W1，无阻塞 · 微票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-126-mcp-border -b t126-mcp-border main
cd .worktrees/wt-126-mcp-border && npm install
```

```text
/implement .scratch/picode-1-8/issues/126-mcp-status-border-separation.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t126-mcp-border。

核心：.settings-mcp-status-line 与 Global/Project 卡边框分离（纯 CSS，
间距节奏对齐 Skills/Packages 节）；状态条显隐两态布局不破（票 96 语义）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 126）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T127 — 设置入口去重（W1，无阻塞 · 微票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-127-settings-entry -b t127-settings-entry main
cd .worktrees/wt-127-settings-entry && npm install
```

```text
/implement .scratch/picode-1-8/issues/127-settings-entry-dedupe.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t127-settings-entry。

核心：TitleBar 齿轮删除（票 63 UI 面退役）；Sidebar 左下齿轮保留；
⌘, keymap 不动（快捷键与可见钮解绑）；票 74 草稿停靠联动（入口删减
不改停靠语义）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 127）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T128 — queue 面板 ZCode 重构（W4，无阻塞 · additive 大票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-128-queue-rebuild -b t128-queue-rebuild main
cd .worktrees/wt-128-queue-rebuild && npm install
```

```text
/implement .scratch/picode-1-8/issues/128-queue-zcode-rebuild.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t128-queue-rebuild。

核心：QueuePanel 重构为 ZCode 构图——拖动柄段内重排（steer/follow-up 各段
内部，越上越先注入；发送时机照旧）+ Edit + 垃圾桶（替代 × 与全局 Clear，
Clear 删除）；「↑ 立即」不做（Q6 否决）；行高对齐（P20）。host 侧 additive
op reorder_queue_entry（票 100 镜像舞步同机制：clearQueue → 重排 → 按序
重投喂、图片保序；SDK 竞态毫秒窗口诚实记录）——实施时报备入 host-contract
smoke（本批唯一 additive 增量）。CONTEXT.md 新增「队列卡」词条是本票 rider。

参照帧：强烈建议 .scratch/compare/ 已有 z18-zcode-queue-1.png 与
z18-zcode-queue-2.png（ZCode 图6/图7）——样式保真基准；建议多模态会话实施。

注意：Edit 预填视口跟随依赖票 117（已合入基线）；拖拽动画/放置指示对齐
票 84 既有语言。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 128）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T129 — thinking 行展开跨重挂载记忆（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-129-thinking-memory -b t129-thinking-memory main
cd .worktrees/wt-129-thinking-memory && npm install
```

```text
/implement .scratch/picode-1-8/issues/129-thinking-expand-memory.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t129-thinking-memory。

核心：thinking 行展开态提升 per-session 视图注册表（expandedThinking
Set<entryId>，expandedTurns 同层）；ThinkingRow 受控化；跨所有重挂载记忆
（Q5=B——设置跳转/会话切换/折叠往返）；会话期内存级（重启回默认）；
Worked 容器 expandedTurns 语义零改动（1.6 旧裁决仅对容器维持）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 129）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T130 — fork 自动命名（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-130-fork-auto-name -b t130-fork-auto-name main
cd .worktrees/wt-130-fork-auto-name && npm install
```

```text
/implement .scratch/picode-1-8/issues/130-fork-auto-name.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t130-fork-auto-name。

核心：handleFork 落地后 setSessionName("Fork of <源名>" ；无名源 = 侧栏
标题投影——首条用户消息，Q7 裁决)；写 fork 自己的会话文件（session_info
既有机制）；session_renamed + 索引刷新照旧；用户可再改名。源文件零改动。

注意：票 131 同 fork 入口（History 定位）——若其复现涉 fork 流程改动需
协调 rebase；本票自身不动 fork 链路其余部分。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 130）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T131 — History 0 rows 复现定位（W5 · 定位票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-131-history-repro -b t131-history-repro main
cd .worktrees/wt-131-history-repro && npm install
```

```text
/implement .scratch/picode-1-8/issues/131-history-zero-rows-repro.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t131-history-repro。

核心：History「0 rows」复现定位——第一复现场景 = fork 会话（可稳定复现）；
插桩点四层（host request_tree 处理 / session_tree 发出与节点数 / supervisor
打标 / registry 落账与 focusedId）；排除清单已实证（数据层三段实跑全通、
路由静态四点全通——见票内背景）。定位即修、修复后 electron smoke 固化
（fork 会话 History 行数断言）；空态文案不动（诚实原则）。

注意：dev-app serialization——定位跑 dev app 前后 ps 自查；长会话症状若
不同根，Comments 分票报备。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 131）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T132 — ⌘J 终端聚焦回归定位（W5 · 定位票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-132-terminal-focus -b t132-terminal-focus main
cd .worktrees/wt-132-terminal-focus && npm install
```

```text
/implement .scratch/picode-1-8/issues/132-terminal-focus-regression.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t132-terminal-focus。

核心：⌘J 焦点不进的回归定位（票 105 复发——操作者问责「请自检」）。
复现场景 = 新开会话 + ⌘J；插桩 focusSeq 双 rAF 机制与 create 后重挂载/
composer 聚焦的时序竞争（票 106/98 为嫌疑干扰源）。修复后全 ⌘J 入口
electron smoke 参数化（会话内/新会话/boot 空态/桥接切回四腿）——回归
防线 = 第一验收项。Comments 必须含诚实复盘（票 105 smoke 覆盖缺口 +
防复发机制），不重开票 105。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 132）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T133 — 用户泡文本可选（W2，无阻塞 · 微票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-133-bubble-select -b t133-bubble-select main
cd .worktrees/wt-133-bubble-select && npm install
```

```text
/implement .scratch/picode-1-8/issues/133-user-bubble-text-selectable.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t133-bubble-select。

核心：.user-bubble-text 增 user-select: text（与 .msg-assistant 同规则）；
技能角标段/缩略图/动作行不放开；FollowView 同规；Copy 语义不变。
视觉零变化（纯选择行为属性）。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 133）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T134 — Finder/Dock 启动可 spawn（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-134-spawn-path -b t134-spawn-path main
cd .worktrees/wt-134-spawn-path && npm install
```

```text
/implement .scratch/picode-1-8/issues/134-finder-dock-spawn-path.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8 总 spec 在
.scratch/picode-1-8/spec.md。你当前在 worktree 分支 t134-spawn-path。

核心：主进程启动时合成子进程 spawn 用的 PATH——登录 shell 快照（$SHELL -lc，
缓存+超时降级）+ 静态探测常见 node 安装点（nvm/`/usr/local/bin`/homebrew/
~/.pi/agent/bin），注入所有需要 PATH 的子 spawn。LSEnvironment 否决（PATH
机器相关）。插桩定位精确断点 = 第一验收项（Finder 启动 spawn 失败的具体
环节，不臆测）；PATH 探测不阻塞窗口就绪。注意：修复对新启动实例生效。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 134）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

```text
你是 PiCode 1.8 的合并会话。职责：操作者或实现会话请求合并时，跑
bash scripts/merge-ticket.sh <NN>（merge-gate 校验 Status=ready-for-human），
处理 rebase 冲突（遵循 resolving-merge-conflicts 纪律），合并后广播
「main 已推进」让其余活跃 worktree rebase。唯一写 main 的角色——
实现会话永不 checkout main。每票合并后核对：票 Status 已翻
ready-for-human、Comments 记 sha、CONTEXT.md 词条 rider 随票入册。
```
