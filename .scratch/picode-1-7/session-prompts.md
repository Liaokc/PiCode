# PiCode 1.7 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-7/spec.md`（R1–R35 决议与验收口径；**每条 R 1:1 映射进票，81–108**（107 文件浏览器、109 visual fixture 修缮——已撤销由 87 顺带交付——为 intake 通道增补票；110 包互通挂 R31）——R5 拆三票、R7/R8/R10 合 81、R14/R17/R19 合 97）。
> 需求定稿全记录（23 痛点 × 六轮 25 问 + file:line 根因 + Pi 包取证 + ZCode bundle 键表 + 两处改判/一处加码）：`.scratch/picode-1-7/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi17-*`（操作者待复制——会话内贴图无法落盘）+ `icon-proposals/`（V2 定稿）。
> 术语新增（子智能体目录/子代理对话/Manual 排序/图片预览/MCP 节 → 各票 rider；回合正文/常显段/过程叙述 live 语义修订 → 票 82）随票入 CONTEXT.md。
> 本批 **4 个 additive 契约/投影增量**：90 子代理桥接、96 MCP 状态事件、97 user_message images、100 queue ops——**实施时报备入 host-contract smoke**。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.7 全部票未开工时点，当前 main = v1.6.0 + 1.7 spec/tracker/issues）
git tag -a picode-1-7-base -m "1.7 baseline: 1.6.0 shipped + 1.7 spec/tracker" main
# ② merge-gate 已含 picode-1-7（本会话 52a31dc 已补——勿再补）
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

## 波次表（9 波；每波 ≤3 并发，遵守 AGENTS.md serialization）

| 波次 | 工单 | 碰撞面要点 | 阻塞 |
|---|---|---|---|
| **W1** | **81** Composer 布局修缮（A 群头） | Composer 卡 CSS/高度投影 | 无 |
| | **82** live 纯时间序（B 群头 · **词条修订 rider**） | turn-collapse 分组 + ChatView | 无 |
| | **83** History toggle 修复 | TreePanel | 无 |
| **W2** | **84** 侧栏拖拽重排（C 群头） | Sidebar + group.ts + 偏好结构 | 无 |
| | **109** visual 4e/4f fixture 排序免疫（**已撤销**——87 顺带交付，票内注记） | visual.ts fixture 区 + .scratch/visual 帧 | 无 |
| | **85** 删幽灵箭头 | TitleBar | 无 |
| | **86** 零标签自动折叠 | layout/panel 模型联动 | 无 |
| **W3** | **87** 表格完整展示 | Markdown 表格 | 无 |
| | **88** 双态预览 | preview 分类 + PreviewTab + 沙箱 iframe | 无 |
| | **89** MCP 配置管理节 | 设置窗新节 + 配置层读写 | 无 |
| **W4** | **90** 子代理桥接+目录（**additive** 桥接） | host 桥接 + 目录投影 + 侧板 tab | 无 |
| | **91** 图片预览浮层 | composer 附件区 | **81** |
| | **102** 应用图标接入 | 打包链 + 资产 | 无 |
| **W5** | **92** 文件条 settled-only | turn-collapse + ChatView | **82** |
| | **93** 发送落底 | scroll-stay 闩 + ChatView effect | **82** |
| | **95** 一键折叠分组 | fold-model + 分区行 | **84** |
| **W6** | **94** 容器折叠锚定 | TurnContainer + 锚定纯函数 | **92** |
| | **96** MCP 状态投影（**additive** 状态事件） | MCP 节状态行 + host 订阅 | **89** |
| | **97** 用户条目三合一（**additive** images · 三词条 rider） | host echo + reducer + 泡渲染 | **82** + **91** |
| **W7** | **98** 按钮焦点纪律 | 全局控件清扫 | **91**（composer 群收官） |
| | **99** 子代理对话 tab | 侧板对话 + steer | **90** |
| | **100** queue 修缮（**additive** queue ops） | QueuePanel + host 队列镜像 | **97**（同 host 文件） |
| **W8** | **101** 子代理停止+徽标 | 停止钮 + 面板徽标 | **99** |
| | **103** 转环增强 | TurnContainer 视觉 | **94** |
| | **104** 运行中重命名 | host handleRename 守卫 | **100** |
| **W9** | **105** 终端即聚焦 | TerminalDock focus | 无 |
| | **106** 新卡片秒出 | registry 乐观注入 + 对账 | **95** |
| | **107** 文件浏览器实时刷新 + 置顶行 View files | Sidebar 置顶行 + FileBrowser（watch 通路则契约增量） | **84** |
| **W10** | **108** 计时不丢 | 容器 header 锚点派生（票 61 口径迁移） | **94** |
| | **110** 双端包安装互通 | PackagesSection force 刷新 + 验证矩阵 | **89** |
| | **111** pi-subagents 0.70.0 适配 | 90/99/101 集成面重验 | **101** |
| | **115** pi-mcp-adapter 2.35.0 适配 | 89/96/110 消费面重验 | **96** |
| **W11** | **114** 图标白边修复 | make-icons alpha 修复步 | 无 |
| | **112** pi 0.86.0 升级适配 | SDK 升级 + 会话格式兼容冒烟 | 无（宜在 110/111 后） |

> 群分：A（composer 群 81→91→98）/ B（转录群 82→92→94→97→103→108）/ C（侧栏群 84→95→106；107 文件浏览器 W9）/ D（子代理 90→99→101）/ 独立快线 83/85/86/87/88/89→96/93/100→104/105/110（110 = 包互通，同设置窗文件群随 89 后；109 visual fixture 修缮已撤销——87 顺带交付，票内注记）。
> **防冲突纪律**（同 v1.1–v1.6，三件事）：
> 1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
> 2. contract / app.css / CONTEXT.md / smoke.ts **只增不改**（追加自己的区段/词条/阶段，不动别人行）；
> 3. 同波票撞同一热点函数 = 停下回报操作者。
>
> **铁律（每张票验收项内嵌，会话自查闭环）**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke / visual harness——跑之前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程；撞锁（端口占用 / 单实例锁失败）= 有会话在跑，等待重试不并跑。其余 worktree 只跑 vitest + typecheck + lint。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-7/issues/
本批波次表：.scratch/picode-1-7/session-prompts.md 的「波次表」节
基线：tag picode-1-7-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。
开场先自查：scripts/merge-ticket.sh 的 Status 门槛必须已含 picode-1-7 目录
（本会话 52a31dc 已补——验证 50 行含 ".scratch/picode-1-7/issues/${NN}-*.md"）。
本批 4 个 additive 增量（90 子代理桥接 / 96 MCP 状态事件 / 97 user_message images / 100 queue ops）——
合并时核对票内「实施时报备入账」项已进 host-contract smoke。

职责循环（操作者说「合并 NN」时）：
1. 读 .scratch/picode-1-7/issues/NN-*.md，确认 Status: ready-for-human、Comments 有实现 sha。
2. bash scripts/merge-ticket.sh NN（脚本内建 rebase + merge --no-ff + 验证）。
3. 合并后向全部活跃 worktree 广播「rebase main」提醒（操作者转达或你在 Notes 记录）。
4. CONTEXT.md 词条 rider 到票的（82/97）：核对词条已随票入册，缺失则退回。
出现冲突/验收疑义：停下升级操作者，不自行裁断。
```

---

## T81 — Composer 布局修缮（W1，无阻塞 · A 群头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-81-composer-layout -b t81-composer-layout main
cd .worktrees/wt-81-composer-layout && npm install
```

```text
/implement .scratch/picode-1-7/issues/81-composer-layout-fixes.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.7 总 spec 在
.scratch/picode-1-7/spec.md。你当前在 worktree 分支 t81-composer-layout。

核心：①带图多行输入任何换行不被附件遮盖（dev app 复现定位 = 第一验收项——
不臆测）；②触顶滚动条完整可见，展开钮不遮（票 58 批准位不动）；③展开/收起
过渡动画对齐侧栏侧板（reduced-motion 直切）。输入路径零 setState 纪律（票 49）
不得破；⌘E 不回归。

注意：本票是 A 群头（91 预览浮层/98 焦点清扫踩你的文件）——改完留清晰接缝。
纯 renderer 零契约增量。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 81）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T82 — live 回合纯时间序（W1，无阻塞 · B 群头 · 词条修订 rider）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-82-live-chronology -b t82-live-chronology main
cd .worktrees/wt-82-live-chronology && npm install
```

```text
/implement .scratch/picode-1-7/issues/82-live-turn-chronology.md

规矩：同 T81（spec .scratch/picode-1-7/spec.md；分支 t82-live-chronology）。

核心：①live 流式 = 纯时间序单流——文本块内联工具间、无临时正文提升、无降级
灰化轮换、无常显段；②落定态维持现状（最终正文 + 折叠容器——ZCode 构图不变）；
③审批卡内联；④ChatView/FollowView 同规。
术语 rider：「回合正文/常显段/过程叙述」live 语义修订（草案 intake-grilling.md）。

注意：你踩 turn-collapse/ChatView 基座——92（文件条）/94（锚定）/97（用户条目）
排你后面合，handler 改动留接缝。纯投影零契约增量。

流程同 T81（merge-ticket.sh 82）。
```

---

## T83 — History toggle 修复（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-83-history-toggle -b t83-history-toggle main
cd .worktrees/wt-83-history-toggle && npm install
```

```text
/implement .scratch/picode-1-7/issues/83-history-toggle-fix.md

规矩：同 T81（分支 t83-history-toggle）。
核心：票 70 同款竞态修复——外点关闭豁免 owning 钮（或等价），展开态再点必收、
外点/Esc 照关、面板内动作不误关。纯状态修零契约。
流程同 T81（merge-ticket.sh 83）。
```

---

## T84 — 侧栏拖拽重排（W2，无阻塞 · C 群头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-84-drag-reorder -b t84-drag-reorder main
cd .worktrees/wt-84-drag-reorder && npm install
```

```text
/implement .scratch/picode-1-7/issues/84-sidebar-drag-reorder.md

规矩：同 T81（分支 t84-drag-reorder）。

核心：①组内会话拖序 + 组间拖序；②筛选下拉 Manual 第三排序项（首次拖拽切入、
可切回、手动序持久化本地偏好）；③组行 grip 转正句柄、Projects 分区行 grip 删除；
④Timeline/置顶不拖、灰行可拖；⑤跨项目移动不做（header.cwd 红线——会话文件
零改动断言必做）。95（一键折叠）排你后面合（同分区行区段）。
流程同 T81（merge-ticket.sh 84）。
```

---

## T85 — 删幽灵箭头（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-85-remove-arrows -b t85-remove-arrows main
cd .worktrees/wt-85-remove-arrows && npm install
```

```text
/implement .scratch/picode-1-7/issues/85-remove-titlebar-arrows.md

规矩：同 T81（分支 t85-remove-arrows）。
核心：删除 titlebar ‹ › 两枚 disabled 占位钮 + aria/快捷键快照清理。纯删除零契约。
流程同 T81（merge-ticket.sh 85）。
```

---

## T86 — 零标签自动折叠（W2，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-86-panel-collapse -b t86-panel-collapse main
cd .worktrees/wt-86-panel-collapse && npm install
```

```text
/implement .scratch/picode-1-7/issues/86-panel-empty-autocollapse.md

规矩：同 T81（分支 t86-panel-collapse）。
核心：openTabs 清空 → 面板自动折叠（layout/panel 双模型联动落点票内裁量）；
重开显既有 tab 选择页；深链自动展开不回归。纯状态修零契约。
流程同 T81（merge-ticket.sh 86）。
```

---

## T87 — 表格完整展示（W3，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-87-table-full -b t87-table-full main
cd .worktrees/wt-87-table-full && npm install
```

```text
/implement .scratch/picode-1-7/issues/87-table-full-display.md

规矩：同 T81（分支 t87-table-full）。
核心：去 360px cap（自然高度 + 宽表横向滚）；删 md-table-preview 浮层与
eye/expand 钮；工具栏留 copy/CSV/TSV。DiagramCard 零回归。
流程同 T81（merge-ticket.sh 87）。
```

---

## T88 — 双态预览（W3，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-88-preview-dual -b t88-preview-dual main
cd .worktrees/wt-88-preview-dual && npm install
```

```text
/implement .scratch/picode-1-7/issues/88-preview-dual-view.md

规矩：同 T81（分支 t88-preview-dual）。

核心：①分类扩展 svg/html/image（扩展名 + 既有嗅探；超限回退源码）；
②SVG = img data-URL 渲染 + 源码；③HTML = sandboxed iframe 渲染
（allow-scripts、无 allow-same-origin、无 Node；相对资源 base = 文件目录）；
④png/jpg/gif/webp 直显；⑤segmented control 复用 markdown 先例。
安全核查留档（sandbox 属性清单 + 零凭据声明）。
流程同 T81（merge-ticket.sh 88）。
```

---

## T89 — MCP 配置管理节（W3，无阻塞 · additive 票族头）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-89-mcp-config -b t89-mcp-config main
cd .worktrees/wt-89-mcp-config && npm install
```

```text
/implement .scratch/picode-1-7/issues/89-mcp-config-section.md

规矩：同 T81（分支 t89-mcp-config）。

核心：设置窗 MCP 节——全局/项目双卡（Skills 同款）、多层合并视图 + 来源徽标、
启停（写 .pi/mcp.json disabled 标志 = adapter 同语义）、增改删（写 /mcp setup
两个正规目标层）、OAuth 流（Authenticate → 浏览器 → 回调自动完成 + 手动粘贴
兜底；凭据零触碰——钥匙串红线）、打开配置文件入口、空态如实。
红线：外部 host 配置绝不写。96（状态投影）排你后面合。
流程同 T81（merge-ticket.sh 89）。
```

---

## T90 — 子代理桥接 + 目录 tab（W4，无阻塞 · additive）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-90-subagent-dir -b t90-subagent-dir main
cd .worktrees/wt-90-subagent-dir && npm install
```

```text
/implement .scratch/picode-1-7/issues/90-subagent-bridge-directory.md

规矩：同 T81（分支 t90-subagent-dir）。

核心：①host inline extension 订阅 pi-subagents in-process RPC + async 事件，
转发 renderer——**additive 增量：实施时报备入 host-contract smoke**；
②目录投影纯模型（会话记录重放主源 + status.json live 增补；七态映射表票内
定稿留档；Show 20 more；嵌套只显顶层折叠计数）；③侧板目录 tab
（Running/Ended/空态/行构图对照 z17-subagent-dir）。
99（对话 tab）排你后面合。全英文文案（Subagents/Running/Ended/...）。
流程同 T81（merge-ticket.sh 90）。
```

---

## T91 — 图片预览浮层（W4，Blocked by 81）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-91-image-preview -b t91-image-preview main
cd .worktrees/wt-91-image-preview && npm install
```

```text
/implement .scratch/picode-1-7/issues/91-image-preview-overlay.md

规矩：同 T81（分支 t91-image-preview）。开工前 rebase main 拿到 81 的基座。
核心：附件缩略图点击 → 全屏遮罩预览；四退出（空格/❌/Esc/遮罩）；关后焦点回
composer。97（气泡缩略图）复用你的浮层——组件留复用接缝。
流程同 T81（merge-ticket.sh 91）。
```

---

## T102 — 应用图标接入（W4，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-102-app-icon -b t102-app-icon main
cd .worktrees/wt-102-app-icon && npm install
```

```text
/implement .scratch/picode-1-7/issues/102-app-icon.md

规矩：同 T81（分支 t102-app-icon）。
核心：V2 图标（定稿参照 .scratch/picode-1-7/icon-proposals/v2-pi-cursor.svg）
正式化进仓库资产 + icns/png 全尺寸 + 打包脚本 icon 选项 + dev Dock 图标。
package:verify 通过 = 硬验收。红线：ZCode 资产不入库（π 为自绘路径）。
流程同 T81（merge-ticket.sh 102）。
```

---

## T92 — 文件条 settled-only（W5，Blocked by 82）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-92-filebar-settled -b t92-filebar-settled main
cd .worktrees/wt-92-filebar-settled && npm install
```

```text
/implement .scratch/picode-1-7/issues/92-filebar-settled-only.md

规矩：同 T81（分支 t92-filebar-settled）。开工前 rebase main 拿 82 的基座。
核心：live 回合不携带/不渲染文件条；agent_end 落地原位出现；Stop/出错回合
照出（事实投影）；FollowView 同规；票 78 聚合语义零回归。
流程同 T81（merge-ticket.sh 92）。
```

---

## T93 — 发送落底（W5，Blocked by 82）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-93-send-pin -b t93-send-pin main
cd .worktrees/wt-93-send-pin && npm install
```

```text
/implement .scratch/picode-1-7/issues/93-send-pin-latch.md

规矩：同 T81（分支 t93-send-pin）。开工前 rebase main 拿 82 的基座。
核心：sendPin 改到达底部才清的闩；四路覆盖（idle/steer/follow-up/排队注入）；
闩期间上滑立即接管（票 75 滚轮赢不回退）。票 45/75 既有决策表零回归。
流程同 T81（merge-ticket.sh 93）。
```

---

## T95 — 一键折叠分组（W5，Blocked by 84）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-95-collapse-all -b t95-collapse-all main
cd .worktrees/wt-95-collapse-all && npm install
```

```text
/implement .scratch/picode-1-7/issues/95-sidebar-collapse-all.md

规矩：同 T81（分支 t95-collapse-all）。开工前 rebase main 拿 84 的基座
（分区行区段归你）。
核心：Projects 分区行 Collapse all / Expand all 双钮；各组形状记忆语义不破；
Timeline 隐藏、置顶区不受影响、会话期内存级不变。
流程同 T81（merge-ticket.sh 95）。
```

---

## T94 — 容器折叠锚定（W6，Blocked by 92）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-94-container-anchor -b t94-container-anchor main
cd .worktrees/wt-94-container-anchor && npm install
```

```text
/implement .scratch/picode-1-7/issues/94-container-anchor.md

规矩：同 T81（分支 t94-container-anchor）。开工前 rebase main 拿 92 的基座。
核心：确定性锚定——离底切换栏头不动（位置差校正 scrollTop）；吸底切换保贴底。
ChatView/FollowView 同规；票 55/56 容器语义零回归。
流程同 T81（merge-ticket.sh 94）。
```

---

## T96 — MCP 状态投影（W6，Blocked by 89 · additive）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-96-mcp-status -b t96-mcp-status main
cd .worktrees/wt-96-mcp-status && npm install
```

```text
/implement .scratch/picode-1-7/issues/96-mcp-status-projection.md

规矩：同 T81（分支 t96-mcp-status）。开工前 rebase main 拿 89 的基座。
核心：server 行连接状态（七态 + toolCount）——host 订阅 adapter
MCP_STATUS_EVENT 转发（**additive：报备入账**）；聚焦会话快照投影；
无会话如实空态；查看不触发懒启动连接。
流程同 T81（merge-ticket.sh 96）。
```

---

## T97 — 用户条目三合一（W6，Blocked by 82+91 · additive · 三 rider）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-97-user-entry -b t97-user-entry main
cd .worktrees/wt-97-user-entry && npm install
```

```text
/implement .scratch/picode-1-7/issues/97-user-entry-trio.md

规矩：同 T81（分支 t97-user-entry）。开工前 rebase main 拿 82 与 91 的基座。

核心：①泡组合块（技能渲染 + 用户文本 + 图片缩略图三段按存在性组合；
skill-only 无空盒）；②气泡缩略图点击开 91 的预览浮层；③Edit 带图 live 还原
（host user_message echo 增 images——**additive：报备入账**；steer/follow-up
echo 同修；reducer live 落账）。容器体内 marker 退役（不再双显）。
Copy 语义不变；Edit-resend 既有语义零回归。
流程同 T81（merge-ticket.sh 97）。
```

---

## T98 — 按钮焦点纪律（W7，Blocked by 91）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-98-focus-discipline -b t98-focus-discipline main
cd .worktrees/wt-98-focus-discipline && npm install
```

```text
/implement .scratch/picode-1-7/issues/98-focus-discipline.md

规矩：同 T81（分支 t98-focus-discipline）。开工前 rebase main 拿 91 的基座
（composer 群收官）。
核心：点击/菜单选完按钮 blur、焦点归还 composer（Enter 永远发送）；focus 圈
仅 :focus-visible（Tab 保留）；全局控件清扫（清单留档）。1.6 票 68/69 菜单
键盘模型零回归。
流程同 T81（merge-ticket.sh 98）。
```

---

## T99 — 子代理对话 tab（W7，Blocked by 90）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-99-subagent-chat -b t99-subagent-chat main
cd .worktrees/wt-99-subagent-chat && npm install
```

```text
/implement .scratch/picode-1-7/issues/99-subagent-conversation.md

规矩：同 T81（分支 t99-subagent-chat）。开工前 rebase main 拿 90 的基座。
核心：目录行点击开任务命名对话 tab（一子代理一 tab、×可关不杀进程）；运行中
转录 live 更新 + steer 发送（回执如实上屏）；已结束只读。
101（停止+徽标）排你后面合。
流程同 T81（merge-ticket.sh 99）。
```

---

## T100 — queue 修缮（W7，Blocked by 97 · additive）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-100-queue-repair -b t100-queue-repair main
cd .worktrees/wt-100-queue-repair && npm install
```

```text
/implement .scratch/picode-1-7/issues/100-queue-repair.md

规矩：同 T81（分支 t100-queue-repair）。开工前 rebase main 拿 97 的基座
（同 host/index.ts 文件）。

核心：①行与卡边分离（水平内距 + 间距）；②行内 Edit（移除该条 + composer
预填原文+原图）与每行 × 删除（全局 Clear 保留）；③host 队列镜像 +
clearQueue/requeue 舞步（保序、图片从镜像取）——**additive ops
edit_queue_entry/remove_queue_entry：报备入账**；SDK 毫秒级竞态诚实记录、
smoke 验证。
流程同 T81（merge-ticket.sh 100）。
```

---

## T101 — 子代理停止 + 徽标（W8，Blocked by 99）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-101-subagent-stop -b t101-subagent-stop main
cd .worktrees/wt-101-subagent-stop && npm install
```

```text
/implement .scratch/picode-1-7/issues/101-subagent-stop-badge.md

规矩：同 T81（分支 t101-subagent-stop）。开工前 rebase main 拿 99 的基座。
核心：运行行方形停止钮 → 确认框 → RPC stop（前台 abort/dispose；状态流转
如实上屏）；侧板开合钮运行计数徽标（零运行无徽标；点击直达目录 tab）。
流程同 T81（merge-ticket.sh 101）。
```

---

## T103 — 转环增强（W8，Blocked by 94）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-103-spinner -b t103-spinner main
cd .worktrees/wt-103-spinner && npm install
```

```text
/implement .scratch/picode-1-7/issues/103-working-spinner.md

规矩：同 T81（分支 t103-spinner）。开工前 rebase main 拿 94 的基座。
核心：live 展开态容器体底部新增同款转环（与顶 header 镜像）；折叠态维持
header 单环；两处增强可见性（更大/强调色——visual 校准）；仅 live、落定无环；
FollowView 同规。纯视觉零契约。
流程同 T81（merge-ticket.sh 103）。
```

---

## T104 — 运行中重命名（W8，Blocked by 100）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-104-rename-midrun -b t104-rename-midrun main
cd .worktrees/wt-104-rename-midrun && npm install
```

```text
/implement .scratch/picode-1-7/issues/104-rename-midrun.md

规矩：同 T81（分支 t104-rename-midrun）。开工前 rebase main 拿 100 的基座
（同 host/index.ts 文件）。
核心：移除 handleRename 的 requireSettledSession 守卫（TUI /name 运行中可用
的 parity）；运行中改名成功、session_renamed + 索引刷新照旧；smoke 加运行中
改名回归。
流程同 T81（merge-ticket.sh 104）。
```

---

## T105 — 终端即聚焦（W9，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-105-terminal-focus -b t105-terminal-focus main
cd .worktrees/wt-105-terminal-focus && npm install
```

```text
/implement .scratch/picode-1-7/issues/105-terminal-focus.md

规矩：同 T81（分支 t105-terminal-focus）。
核心：⌘J/标题栏钮打开终端停靠后焦点立即进 userTerm（挂载时序票内裁量）；
桥接同框切回终端同样聚焦；桥接面板可见时不抢焦点；终端既有交互零回归。
流程同 T81（merge-ticket.sh 105）。
```

---

## T106 — 新会话卡片秒出（W9，Blocked by 95）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-106-instant-card -b t106-instant-card main
cd .worktrees/wt-106-instant-card && npm install
```

```text
/implement .scratch/picode-1-7/issues/106-instant-new-task-card.md

规矩：同 T81（分支 t106-instant-card）。开工前 rebase main 拿 95 的基座。
核心：create 派发时乐观注入占位会话卡/分组（registry 合并，现有分组/排序
语义生效）；session_created 对账替换；boot 失败移除占位 + toast 如实；
占位卡不显未知量、不伪装已确认；索引轮询不动；与拖拽排序（84）共存。
流程同 T81（merge-ticket.sh 106）。
```

---

## T107 — 文件浏览器实时刷新 + 置顶行 View files（W9，Blocked by 84）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-107-fb-refresh-pinned-viewfiles -b t107-fb-refresh-pinned-viewfiles main
cd .worktrees/wt-107-fb-refresh-pinned-viewfiles && npm install
```

```text
/implement .scratch/picode-1-7/issues/107-filebrowser-refresh-pinned-viewfiles.md

规矩：同 T81（分支 t107-fb-refresh-pinned-viewfiles）。84 已合入 main，
开工前基线即含拖拽重排；Sidebar.tsx 以 84 落定后的行/组结构为准。
核心：①文件浏览器实时刷新——watch 通路（契约增量则 additive-only +
host-contract smoke 报备，同 90/96/97/100 先例）或零契约失效重读，票内
裁量；实测不可靠才降级加手动刷新钮（证据留 Comments）。②置顶区会话行
hover 出 View files 入口（两视图 Pinned 分区一致），走会话→项目 cwd 映射。
流程同 T81（merge-ticket.sh 107）。
```

---

## T108 — 计时与时长显示（W10，Blocked by 94）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-108-timer-continuity -b t108-timer-continuity main
cd .worktrees/wt-108-timer-continuity && npm install
```

```text
/implement .scratch/picode-1-7/issues/108-working-timer-continuity.md

规矩：同 T81（分支 t108-timer-continuity）。开工前 rebase main 拿 94 的基座。
核心：①live 计时不丢（回合锚点派生，票 61 口径迁移；四种切换组合不归零）；
②Worked 时长显示——落定回合统一 chevron 右侧、含重放回合（票 14 口径修订）。
数据 = 条目时间戳派生（ADR-0002）；FollowView 同规。
流程同 T81（merge-ticket.sh 108）。
```

---

## T109 — visual 4e/4f fixture 排序免疫 + 全量重捕获（W2 追加，无阻塞）

> ⚠️ **已撤销（2026-09-18，操作者裁决）**：内容已由票 87 顺带交付（merge `b252842`——prov-13 排序免疫 + 全量 transcript 绿 + 帧重捕获），Status 已翻 wontfix。**勿开工**，票内注记在案。

```bash
cd ~/PiCode
git worktree add .worktrees/wt-109-transcript-fixture -b t109-transcript-fixture main
cd .worktrees/wt-109-transcript-fixture && npm install
```

```text
/implement .scratch/picode-1-7/issues/109-transcript-4e-fixture.md

规矩：同 T81（分支 t109-transcript-fixture）。

核心：①4e/4f fixture 当前 provider 从 bella/GLM-5.3 改 prov-11/m-11（"Provider 11"
在排序世界与未排序世界都位于 index 11——双世界免疫，论证留档）；②重跑全量
visual:transcript 全绿 + 重捕获 9 帧（4e/4f/5…/9…，标题栏无箭头残留）。
零产品代码改动、零契约增量；bisect 不可用（69 合并起每 checkout 同型失败）。
环境：electron 运行需 unset ELECTRON_RUN_AS_NODE + PATH 前置 /usr/local/bin；
跑 harness 前 ps 自查 serialization。
流程同 T81（merge-ticket.sh 109）。
```

---

## T110 — 双端包安装互通（W10，Blocked by 89）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-110-packages-cross -b t110-packages-cross main
cd .worktrees/wt-110-packages-cross && npm install
```

```text
/implement .scratch/picode-1-7/issues/110-packages-cross-face.md

规矩：同 T81（分支 t110-packages-cross）。开工前 rebase main 拿 89 的基座
（同设置窗文件群）。

核心：①Packages 节挂载/设置窗打开 force 刷新（消 TUI 侧安装后的 per-dir
缓存盲区）；②双端验证矩阵（PiCode 装→settings.json 断言；TUI 装→列表反映+
新会话可用；真实包 pi-mcp-adapter/pi-subagents 现成测试对象）；③安装成功
文案注明「新会话生效」（两侧同语义，如实）。
流程同 T81（merge-ticket.sh 110）。
```

---

## T111 — pi-subagents 0.70.0 适配（W10，Blocked by 101）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-111-subagents-070 -b t111-subagents-070 main
cd .worktrees/wt-111-subagents-070 && npm install
```

```text
/implement .scratch/picode-1-7/issues/111-subagents-070-adaptation.md

规矩：同 T81（分支 t111-subagents-070）。开工前 rebase main 拿 101 的基座。

核心：pi-subagents 已 0.68.0→0.70.0（核心集成面文档核对无 breaking）。在
0.70.0 上重验 90/99/101 全部集成面（RPC 回复形状/status.json 字段/事件/
七态投影对照真实子代理运行）——漂移即修、不漂移留档；0.70 新能力呈现 =
观察项不立项。
流程同 T81（merge-ticket.sh 111）。
```

---

## T112 — pi 0.86.1 升级适配（无阻塞 · 宜在 110/111 后）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-112-pi-086 -b t112-pi-086 main
cd .worktrees/wt-112-pi-086 && npm install
```

```text
/implement .scratch/picode-1-7/issues/112-pi-086-adaptation.md

规矩：同 T81（分支 t112-pi-086）。宜在 110/111 合入后跑（全量回归一次收口）。

核心：①内嵌 SDK 0.85.1→0.86.1（TUI 已实测 0.86.1——ADR-0005 首次漂移收口）；
②会话格式兼容冒烟——TUI 0.86 写的会话（新 entry 类型）PiCode 能开、优雅降级；
③三条 breaking 交叉核对均不命中（typecheck 实证收口）；④全量回归绿。
流程同 T81（merge-ticket.sh 112）。
```

---

## T114 — 图标白边修复（W11，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-114-icon-alpha -b t114-icon-alpha main
cd .worktrees/wt-114-icon-alpha && npm install
```

```text
/implement .scratch/picode-1-7/issues/114-icon-alpha-fix.md

规矩：同 T81（分支 t114-icon-alpha）。

核心：make-icons.mjs 光栅化后加确定性 alpha 修复步（qlmanage 白垫底——
边缘连通白区 flood-fill → 透明；intake 已 1024 试算验证）；iconset/icns
重生成；打包产物 Dock 实视无白边 = 硬验收；c102-icon-* 帧重捕获。
零产品代码、零契约增量。
流程同 T81（merge-ticket.sh 114）。
```

---

## T115 — pi-mcp-adapter 2.35.0 适配（W11，Blocked by 96）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-115-mcp-235 -b t115-mcp-235 main
cd .worktrees/wt-115-mcp-235 && npm install
```

```text
/implement .scratch/picode-1-7/issues/115-mcp-adapter-235-adaptation.md

规矩：同 T81（分支 t115-mcp-235）。开工前 rebase main 拿 96 的基座。

核心：pi-mcp-adapter 已 2.34.0→2.35.0（核心消费面文档核对无 breaking）。
在 2.35.0 上重验 89/96/110 全部消费面（状态快照事件形状/写目标语义/OAuth
流实测）——漂移即修、不漂移留档；2.35 新能力呈现 = 观察项不立项。
流程同 T81（merge-ticket.sh 115）。
```

---

## 批次收尾（全部票合入后，操作者）

```bash
cd ~/PiCode
npm test && npm run smoke          # 全量兼容套件（含真实模型调用，serialization 独占）
npm run package:verify             # 发布前打包验证（含 102 图标实视）
git tag -a v1.7.0 -m "1.7.0 (subagent fleet, MCP management, live chronology, drag reorder, composer fixes, skill bubble, app icon, dual-view preview, queue repair)" main
cp .scratch/picode-1-7/session-prompts.md .scratch/archive/session-prompts-v1.7.md  # 手册归档（收尾惯例）
```

版本事实自查（发布前）：内嵌 SDK ↔ 全局 pi 版本对齐（ADR-0005；1.6 时点 0.85.1）——若 npm/全局 pi 有新版，重走 SDK 对齐检查点后再打 tag。
