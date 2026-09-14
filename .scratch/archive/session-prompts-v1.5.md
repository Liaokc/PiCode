# PiCode 1.5 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。
> 总 spec：`.scratch/picode-1-5/spec.md`（R1–R8 决议与验收口径）。
> 需求定稿全记录（Q1–Q14 三轮 + ZCode 取证参数 + file:line 根因 + 思维链调查存档）：`.scratch/picode-1-5/intake-grilling.md`。
> 证据帧：`.scratch/compare/pi15-*`（九帧）。
> 术语新增（预警横幅 / 灰行 → 票 54；工作容器 → 票 55；常显段 → 票 56；图卡 → 票 59）随票入 CONTEXT.md。

## 开工前一次性准备（操作者）

```bash
cd ~/PiCode
# ① 基线 tag（= 1.5 全部票未开工时点，当前 main @ afd9fbd + 1.5 spec/tracker + ls-files 补丁）
git tag -a picode-1-5-base -m "1.5 baseline: 1.4.0 shipped + 1.5 spec/tracker" main
# ② merge-ticket.sh 的 Status 门槛已含 picode-1-5（2026-09-10 操作者授权 intake 会话补，已验证 50 行）
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

## 波次表（2 波；W1 七票无硬阻塞，受 ≤3 并发自然分批）

| 波次 | 工单 | 碰撞面要点 | 阻塞 |
|---|---|---|---|
| **W1** | **54** 幽灵 cwd 供面（**唯一触 main/contract**：cwdMissing additive） | 索引投影 + 侧栏灰行 + ChatView 横幅 + smoke | 无 |
| | **55** Worked 容器常驻化 | 回合分组纯模型 + ChatView/TurnContainer 条件 + **CONTEXT.md 词条 rider** | 无 |
| | **57** ⌘E 快捷键 | keymap + 展开状态机 + App 路由 + Composer tooltip | 无 |
| | **58** Composer 遮盖修复 | app.css 输入区段（纯 CSS） | 无 |
| | **59** mermaid 图卡 | Markdown 块投影 + 卡组件 + **新 npm 依赖（懒加载）** + **CONTEXT.md 词条 rider** | 无（需网络装依赖） |
| | **61** ThinkingRow 双修 | ThinkingRow + reducer 时间戳字段 | 无 |
| | **62** 导航轨层叠修复 | app.css 层叠段（纯 CSS） | 无 |
| **W2** | **56** 回合时间序修订 | splitTurn 扩展 + 常显段渲染 + **CONTEXT.md 词条 rider** | **55**（同文件强串行） |
| | **60** 代码卡与表格补齐 | 行号/下载/startLine + CSV/TSV | **59**（同文件串行） |
| **追加链** | **63** 设置窗基座 + 技能管理（**probe 报告 additive 增量**） | 新设置窗 + Skills 节 + **CONTEXT.md 词条 rider** | 无（零文件交集，可即刻开工） |
| | **64** 包管理（Packages 节，全局+项目级+信任态） | 设置窗 Packages 节 | **63**（同窗口文件） |
| | **65** Usage 图表交付缺口补齐（1.3 R11 补交付） | charts.ts 钳制 + hover 白卡 | 无（零文件交集） |

> 追加链（63/64/65，2026-09-11 增补）与 54–62 零文件交集，不扰动已开工票；**操作者已拍板全部纳入 v1.5.0 发布范围**（12 票同批验收）。

> W1 七票无硬阻塞；同波热点：54/55 都触 ChatView（横幅插点 vs 回合渲染条件——**区域不同**，靠 rebase 纪律，不设硬边）；58（app.css 输入区段）与 62（app.css 层叠段）**区段不相交**；57 与 58 无文件交集。W2 两票各自吃 W1 的基座。

**防冲突纪律**（同 v1.1–v1.4，三件事）：
1. 每票合入 main 后，其余活跃 worktree **立即** `git rebase main`；
2. contract / app.css / CONTEXT.md / smoke.ts **只增不改**（追加自己的区段/词条/阶段，不动别人行）；
3. 同波票撞同一热点函数 = 停下回报操作者。

**铁律（本批已写进每张票的验收项，会话自查闭环）**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke / visual harness——跑之前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程；撞锁（端口占用 / 单实例锁失败）= 有会话在跑，等待重试不并跑。其余 worktree 只跑 vitest + typecheck + lint。全量 smoke（含真实模型调用）留合并会话/操作者按惯例执行。

---

## T00 合并会话（长驻，唯一允许写 main 的角色）

在主工作区 `~/PiCode` 开一个专用 pi 会话（建议配便宜快速的模型），粘贴以下 prompt 原文：

```text
你是 PiCode 仓库的「合并会话」——唯一允许把工单分支写进 main 的角色。你不开发任何功能。

本批 tracker：.scratch/picode-1-5/issues/
本批波次表：.scratch/picode-1-5/session-prompts-v1.5.md 的「波次表」节
基线：tag picode-1-5-base；每票开工 = main 最新，合并时分支基点应无代差（有则按冲突分级处理）。
开场先自查：scripts/merge-ticket.sh 的 Status 门槛必须已含 picode-1-5 目录
（2026-09-10 已由操作者授权补入——验证 50 行含 ".scratch/picode-1-5/issues/${NN}-*.md" 即可）。

职责循环（操作者说「合并 NN」时）：
1. 前置检查：票文件 Status 必须是 ready-for-human；对应 worktree 必须干净
   （不干净先甄别：harness 产物按证据规则处置，见下）。
2. merge-gate 簿记：main 上的票文件若还是旧状态，用 git checkout <branch> -- <票文件>
   原样取分支终态到 main 提交 sync——必须原样取分支版本，分支自己的 tracker
   提交 rebase 时会自动去重/零冲突（v1.4 三次同路径先例）。
3. 若操作者未明说已验收：提醒其先在 worktree 跑 npm run dev 目检
   （dev-app serialization 铁律），得到明确「已验收」再继续。
4. 执行 bash scripts/merge-ticket.sh NN。rebase/合并冲突按性质分级：
   - tracker 状态对撞 → 例行，取 main 侧（HEAD）；
   - package-lock.json → 59 的 mermaid 依赖合入后其余票必遇：取任一侧后
     npm install 再生再 add；
   - 契约 / app.css 追加区段 / CONTEXT.md 词条 / smoke.ts 追加阶段
     → 双方保留（只增不改）；
   - ChatView 邻接（54 横幅 / 55 容器条件 / 56 常显段——区域不同但同文件）
     → 若文本级冲突：优先自动合并；语义级拿不准 → git rebase --abort 恢复干净，
     向操作者报告冲突文件 + 双方意图 + 整合指令草案，退回所属工单会话
     （先例模式：该会话 rebase main 自行整合 → 重跑验证门 → 二次验收 → 我重合）；
   - 二进制 PNG → 取更新的一次重拍；两张都过时则取后合入侧并在 tracker 注明待重拍。
5. 合并后终态审计：抽查关键接缝是否在 main 上幸存（CONTEXT 词条 / app.css 区段 /
   纯函数套件 / smoke 阶段 / 无冲突标记残留）；确认 typecheck + tests 绿（脚本已跑，
   报出确切测试数）。
6. tracker：Status 改 resolved，## Comments 追加 merge sha、验收口径、冲突处置记录。
7. 清理：git worktree remove .worktrees/wt-NN-* && git branch -d tNN-*；提醒其他
   活跃 worktree rebase main（附对撞面预判）。
8. 向操作者播报：本次合并解锁了哪些新工单（波次表）。

证据规则（worktree 里未跟踪/改动的截图）：
- 票特有新帧（新 harness 场景输出、58 文本贴钮帧、59 图卡帧、55 零工作落定帧等）→ 入库；
- 既有帧被重拍且属本票功能面、无更近的覆盖重拍 → 入库；
- 既有帧被重拍但即将被下一张票覆盖 → git restore 丢弃；
- 跨票回归验证产物 → 入库并在提交信息注明用途。

收官发布（操作者说「发布 vX.Y.Z」时）：
1. 手册归档（照 v1.0–v1.4 先例，chore 提交到 .scratch/archive/）；
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

## T54 — 幽灵 cwd 供面（W1，无阻塞 · 本批唯一触 contract）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-54-ghost-cwd-supply -b t54-ghost-cwd-supply main
cd .worktrees/wt-54-ghost-cwd-supply && npm install
```

```text
/implement .scratch/picode-1-5/issues/54-ghost-cwd-banner-gray-row.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.5 总 spec 在
.scratch/picode-1-5/spec.md。你当前在 worktree 分支 t54-ghost-cwd-supply。

核心：① 契约增量（additive，实施时报备）——会话摘要投影增 cwdMissing 标志，
旧载荷缺字段照常通过；死亡/活豁免/复现恢复三态表驱动（cwd-liveness 套件扩展）。
② 预警横幅——受感染会话视图顶部常驻：三条事实文案（运行继续/文件工具会失败/
退出后无法重开，全英文）、无关闭钮、cwd 存活性翻转即自动显隐（纯派生投影）；
只影响该会话视图，不动状态点词汇。③ 灰行——侧栏置灰 + "cwd missing" meta，
点击仅弹解释 toast、零 resume 调用（resume 已删 cwd 必 host exit(1)——纯展示态）；
右键菜单保留 Archive/Copy task path/Copy session file path/Copy session ID，
打开类动作不出现；⌘K 维持排除。④ 目录复现横幅与灰行自动恢复。
检测零新建：索引服务既有 2s cwd stat 周期就是信号源。

注意：本票 ChatView 横幅与 55/56 邻接（区域不同）——合入前 rebase main。
术语 rider：「预警横幅（CWD Banner）」「灰行（Dimmed Row）」入 CONTEXT.md。

流程：Status→claimed → 实现全验收项 → 全英文文案 → code-review → 提交当前
分支（不自行 merge，提示操作者 bash scripts/merge-ticket.sh 54）→
Status 改 ready-for-human + Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T55 — Worked 容器常驻化（W1，无阻塞 · 56 的基座）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-55-worked-container-always -b t55-worked-container-always main
cd .worktrees/wt-55-worked-container-always && npm install
```

```text
/implement .scratch/picode-1-5/issues/55-worked-container-always.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
ZCode 锚点（零工作回合不渲染容器——本票是操作者批准的 ZCode 偏离）见票内背景
与 intake-grilling.md。你当前在 worktree 分支 t55-worked-container-always。

核心：① 回合分组投影修订——有用户气泡回合必有容器（live "Working · Ns" 含首个
工作项出现前的静默期；落定 "Worked · Ns"；回放无时长只显 "Worked"——票 14 规则）；
零工作项回合容器体空且不可展开（无 chevron、点击无响应；可展开 ⇔ 体非空）；
HEAD 回合维持现状。② ChatView 空壳条件 `(hasWork || live)` 由新规则取代；
FollowView 同投影零开关。③ 容器级计时跨折叠保持（容器本体不因折叠卸载）。
表驱动覆盖：零工作 live/落定/回放、有工作各态、HEAD。

术语 rider：「工作容器（Worked Container）」入 CONTEXT.md（偏离记录双写：
词条 + spec）。性能红线：纯模型改动零额外转录重渲染。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 55）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T56 — 回合时间序修订（W2，Blocked by 55）

```bash
cd ~/PiCode
# 等 55 合入 main 后再开工；先 git fetch 确认 main 含 t55 分支
git worktree add .worktrees/wt-56-turn-chronology -b t56-turn-chronology main
cd .worktrees/wt-56-turn-chronology && npm install
```

```text
/implement .scratch/picode-1-5/issues/56-turn-chronology-after-answer.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
ZCode 锚点（正文后所有行 assistantFollowingRows 全类型常显）见票内背景与
intake-grilling.md。你当前在 worktree 分支 t56-turn-chronology。
本票修订票 53 的 Q11a 裁剪（可逆显示投影规则，无新 ADR）。

核心：① 分割纯模型扩展——lastText 之后的所有行（tool/thinking/approval）进
常显段按转写顺序渲染正文下方；lastText 之前分类不变；② 降级重划分——新文本块
流式开始时旧答案降级过程叙述归容器、常显段清空（票 53 既有规则，操作者重申）；
③ 审批两态同位——挂起卡位置 = 批准后工具卡位置，零跳变；④ 常显段 thinking 行
渲染为折叠单行（Thought · Ns ›）可展开；⑤ ChatView/FollowView 同规则零开关。
electron smoke 需脚本化 live 回合经审批闸门断言两态同位（既有审批 smoke 基建先例）。

术语 rider：「常显段（After-Answer Segment）」入 CONTEXT.md。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 56）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T57 — Composer 展开钮快捷键 ⌘E（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-57-composer-expand-shortcut -b t57-composer-expand-shortcut main
cd .worktrees/wt-57-composer-expand-shortcut && npm install
```

```text
/implement .scratch/picode-1-5/issues/57-composer-expand-shortcut.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
你当前在 worktree 分支 t57-composer-expand-shortcut。

核心：① keymap 表（物理 code、meta-only、⌥ 拒绝——票 27 表驱动先例）增 KeyE 行；
② 展开状态机（票 49 Seam-1）新增键位事件（与 click/Esc/send 并列；非法迁移拒绝）；
③ App 层路由至当前聚焦会话 composer——New Task 空态同生效，FollowView no-op；
④ tooltip 改键帽 ⌘E（Tooltip 纪律：有快捷键只显键帽——取代 "Expand input"）。
既有收回三路（再点/Esc/发送成功后）零回归。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 57）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T58 — Composer 遮盖修复（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-58-composer-covering-fix -b t58-composer-covering-fix main
cd .worktrees/wt-58-composer-covering-fix && npm install
```

```text
/implement .scratch/picode-1-5/issues/58-composer-covering-fix.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
你当前在 worktree 分支 t58-composer-covering-fix。

核心：输入区右 padding 18→约 44px（预留右上角展开钮区）——首行文本与光标永不
穿钮下；折叠/展开两态同规则；按钮位置与 chrome 零变化（票 49 Q12 拍板的右上角
位置不动——遮盖是缺陷不是位置错误）。ZCode 无此钮（偏离项），无校准参照。
纯 CSS 级小票：app.css 输入区段追加/修改，不动他人区段（62 动层叠段——区段
不相交）。visual harness 两帧（文本贴钮 + 展开态）。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 58）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T59 — mermaid 图卡（W1，无阻塞 · 需网络装依赖）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-59-mermaid-diagram-card -b t59-mermaid-diagram-card main
cd .worktrees/wt-59-mermaid-diagram-card && npm install
```

```text
/implement .scratch/picode-1-5/issues/59-mermaid-diagram-card.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
ZCode 取证锚点（图卡结构/能力位默认/懒加载分片）见票内背景与 intake-grilling.md。
你当前在 worktree 分支 t59-mermaid-diagram-card。

核心：① 新增 mermaid npm 依赖——按图型懒加载分片（动态 import），主包零增量
（ZCode 同型）；② 围栏卡型投影纯函数——mermaid 闭合+解析成功 → 图卡；流式未
闭合 → 源码卡；解析失败 → 源码卡回退（lang 标签照常，不弹错误 toast）；
③ 图卡 UI——小写 mono "mermaid" 标签头 + 右上 sticky 操作钮组（download
SVG/PNG/MMD 下拉、copy 源码、fullscreen 根层浮层 Esc 退）+ 渲染体 panZoom；
主题用库默认浅色（深色全应用范围外）。

术语 rider：「图卡（Diagram Card）」入 CONTEXT.md。60 强串行于本票（同文件）。
package-lock 变更——合并时 T00 按既定分级处置。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 59）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T60 — 代码卡与表格补齐（W2，Blocked by 59）

```bash
cd ~/PiCode
# 等 59 合入 main 后再开工
git worktree add .worktrees/wt-60-code-card-table -b t60-code-card-table main
cd .worktrees/wt-60-code-card-table && npm install
```

```text
/implement .scratch/picode-1-5/issues/60-code-card-table-completion.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
ZCode 取证锚点（行号默认/noLineNumbers/startLine/download；表格四格式家族）
见票内背景与 intake-grilling.md。你当前在 worktree 分支 t60-code-card-table。

核心：① 代码卡行号默认开（noLineNumbers 元参数可关；startLine=N 平移计数；
与既有 wrap/copy chrome 共存——所有代码卡视觉密度变化是操作者明知拍板）；
② download 钮（按语言推导扩展名存文件）；③ 表格工具排增 copy as CSV/TSV
（既有 copy as Markdown/preview/expand 三钮零回归；表格 fullscreen 不做——
ZCode 自关）。序列化与投影全表驱动。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 60）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T61 — ThinkingRow 双修（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-61-thinking-row-fixes -b t61-thinking-row-fixes main
cd .worktrees/wt-61-thinking-row-fixes && npm install
```

```text
/implement .scratch/picode-1-5/issues/61-thinking-row-timer-chevron.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
你当前在 worktree 分支 t61-thinking-row-fixes。

核心：① 计时基准 entry 级——思考部分流式开始时记开始时间戳（reducer 侧
additive 字段，缺席回退现行为），显示秒数由（当前 − 开始）推算：容器折叠重开
（组件重挂载）从同一时间戳续算不归零（修 pi15-thinking-timer-reset 的 7s→3s）；
durationMs 冻结优先（既有契约）；回放块无时长降级（票 14 规则零回归）。
② 箭头对齐 Worked 惯例：收起 ›、展开 ⌄（替换现有 ChevronDown+rotate(180deg)
基准；live Thinking 与落定 Thought 一致）。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 61）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T62 — 导航轨层叠修复（W1，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-62-rail-stacking-fix -b t62-rail-stacking-fix main
cd .worktrees/wt-62-rail-stacking-fix && npm install
```

```text
/implement .scratch/picode-1-5/issues/62-rail-stacking-fix.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
你当前在 worktree 分支 t62-rail-stacking-fix。

核心：chat 主区自构成层叠上下文（isolation / 等效 z-index 方案），使导航轨的
z 值在主区子树内参与比较而非直达根上下文——侧栏子树（含 z:80 右键菜单）整体
恢复高于轨道。验证面：右键菜单九项完整可见可点击；轨道悬停气泡、回底钮（z:10）、
根层 tooltip/各浮层零回归。被拒方案 portal（spec 记录）。纯 CSS 级小票：
app.css 层叠段，不动他人区段（58 动输入区段——区段不相交）。visual 帧
（对照 pi15-rail-over-context-menu）。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 62）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T63 — 设置窗基座 + 技能管理（追加链，无阻塞 · 2026-09-11 增补）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-63-settings-window-skills -b t63-settings-window-skills main
cd .worktrees/wt-63-settings-window-skills && npm install
```

```text
/implement .scratch/picode-1-5/issues/63-settings-window-skills.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
管理面取证（Pi packages/skills 机制、信任门实测、cc-switch SSOT 借鉴边界、
本机软链图）见 .scratch/picode-1-5/intake-mgmt-recon.md。你当前在 worktree
分支 t63-settings-window-skills。

核心：① 设置窗——标题栏齿轮 + ⌘, 开合；左侧节导航（Skills / Packages 两节，
Packages 节留占位给 64）；② Skills 节——列表以 Pi 实际加载面为准（probe
resourceLoader 枚举扩展：user dir / package / project 来源徽标），per-技能启停
（写 settings，与 pi config 同格式），打开所在目录，删除仅删 ~/.pi/agent/skills
下链接/条目（软链真身零触碰——表驱动断言）；包内技能不可删。新建/编辑不做。

术语 rider：「设置窗（Settings Window）」入 CONTEXT.md。契约增量：probe 报告
技能来源维度（additive，实施时报备）。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 63）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T64 — 包管理 Packages 节（追加链，Blocked by 63）

```bash
cd ~/PiCode
# 等 63 合入 main 后再开工
git worktree add .worktrees/wt-64-packages-management -b t64-packages-management main
cd .worktrees/wt-64-packages-management && npm install
```

```text
/implement .scratch/picode-1-5/issues/64-packages-management.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md；
信任门实测（resolveProjectTrusted / installMissing）与安全边界见
intake-mgmt-recon.md。你当前在 worktree 分支 t64-packages-management。

核心：① 全局层——settings packages 数组的列表/安装（npm:/git:/本地）/
移除/启停（与 pi install/remove 同落点）；② 项目级层——cwd 的
.pi/settings.json 同套管理；③ 信任态只读展示——读 trust.json + ask-无决策
派生 untrusted，untrusted 横幅「项目资源未被 Pi 加载」；零 trust.json 写入。
UI 词汇 = Packages（Q8 拍板；ZCode 的 plugin 语义不借用）。空态如实
（操作者当前 packages 为空）。安装安全文案沿用 Pi 官方口吻。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 64）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T65 — Usage 图表交付缺口补齐（追加链，无阻塞）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-65-usage-charts-completion -b t65-usage-charts-completion main
cd .worktrees/wt-65-usage-charts-completion && npm install
```

```text
/implement .scratch/picode-1-5/issues/65-usage-charts-completion.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
本票 = 1.3 批 R11 既定决议的补交付（1.3 spec.md:37/110 已写明钳制根因与
hover 形态及测试预案；/to-tickets 时未落票）+ 双区间风格统一增量。
ZCode 对齐锚点：.scratch/compare/z13-usage-trend-hover.png /
z13-usage-donut-hover.png；本批对照帧 pi15-usage-30d-trend /
pi15-usage-7d-trend。你当前在 worktree 分支 t65-usage-charts-completion。

核心：① smoothPath 控制点钳制进 [top, baseline]（charts.ts:222 根因——
曲线永不破底）；② 7 天/30 天同一插值/钳制参数（风格统一）；③ 趋势 hover =
竖导线 + 交点圆点 + 白卡（日期 · 各模型 tokens · 合计，最近日吸附——复用
onClick 坐标映射）；圆环 hover = 白卡（模型 · tokens · 占比）；点击
drilldown 零回归。

流程：Status→claimed → 实现全验收项 → code-review → 提交当前分支（不自行
merge，提示操作者 bash scripts/merge-ticket.sh 65）→ Status 改 ready-for-human
+ Comments 记 sha。跑应用通道前 ps 自查（票内验收项）。
```

---

## T66 — 基座 visual harness fork-toast ACK 修复（追加链，无阻塞 · 2026-09-11 立票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-66-fork-toast-ack-announce -b t66-fork-toast-ack-announce main
cd .worktrees/wt-66-fork-toast-ack-announce && npm install
```

```text
/implement .scratch/picode-1-5/issues/66-fork-toast-ack-announce.md

规矩：CONTEXT.md 是术语权威；1.5 总 spec 在 .scratch/picode-1-5/spec.md。
你当前在 worktree 分支 t66-fork-toast-ack-announce。

核心：基座 visual:transcript 的 2d 段恢复 PASS——fork 点击后由 harness 补发一条
新 id 的 session_created 公告（票 51 的 ACK 链路兑现：公告 scopeId ≠ fork 目标
id → toast "Forked to a new session."）；因公告会切焦点并重置 chat
（applyAnnouncement 语义——ADR-0006「announcement = now looking at it」），
fork 段（点击 + toast 断言 + 清场等待）迁移到 3-expanded 密度帧之后、
ticket-14 replay 公告之前——2e/3-expanded 在未切焦点的 settled 转录上拍摄，
帧名 2d 保留，其余帧零改动零重拍。其后 ticket-14 replay 本就重新 announce，
焦点自然回轨。

边界：diff 仅 src/main/visual.ts（基座段，additive 纪律）；零契约增量；
app/renderer/契约零改动（票 51 ACK 语义原样）；侧栏确定性布景不受影响
（合成公告无磁盘文件，索引进不出）——electron 层验证或注释论证留痕。

流程：Status→claimed → 实现全验收项（含 visual:transcript 全链跑通、2d 恢复
PASS 且后续段零回归）→ code-review → 提交当前分支（不自行 merge，提示操作者
bash scripts/merge-ticket.sh 66）→ Status 改 ready-for-human + Comments 记 sha。
跑 visual:transcript 前 ps 自查（票内验收项铁律）。
```
