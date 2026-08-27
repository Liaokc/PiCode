# PiCode 1.0 — Worktree 并行开发 · 会话 Prompt 手册

> 每个工单一个新 pi 会话、一个 worktree、一条分支。本手册每块都可独立复制粘贴。
> 约定详情见 `AGENTS.md › Parallel development (git worktrees)`。

## 当前状态

- **01 净场与脚手架**：进行中（主工作区 `~/PiCode`，main 分支）。主工作区从此只当**合并枢纽**，不再接工单。

## 操作者流程（每张工单固定四步）

```bash
# ① 确认阻塞票已合入 main（git log --oneline | head 看合并记录）
# ② 在主工作区创建 worktree + 分支（命令见各票块）
# ③ cd 进 worktree && npm install   （国内网络慢可加：
#    ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install）
# ④ 在 worktree 目录里启动 pi，粘贴对应 prompt
```

完成后：实现会话会把票提交到自己的分支并停下；**你来合并**：

```bash
cd ~/PiCode && git merge --no-ff t<NN>-<slug>
# 若还有其他活跃 worktree，进各自目录执行 git rebase main
```

## 并行波次与最大并发

| 波次 | 可同时进行 | 并发数 |
|---|---|---|
| W2 | 02 | 1 |
| W3 | **03 ∥ 04 ∥ 06** | 3（上限） |
| W4 | 05 ∥ 07 ∥ 08 | 3 |
| W5 | 10（若 09 已完） | 1 |
| W6 | 11 | 1 |
| W7 | 12 | 1 |

**铁律**：任一时刻全仓最多一个 worktree 跑 Electron dev / e2e / smoke；其余 worktree 只跑 vitest + typecheck。

---

## T02 — Host 活体：最小聊天闭环（阻塞：01 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-02-host-live-chat-loop -b t02-host-live-chat-loop
cd .worktrees/wt-02-host-live-chat-loop && npm install
```

```text
/implement .scratch/picode-1-0/issues/02-host-live-chat-loop.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md（用户故事与三条测试缝）；截图基准在
.scratch/reference/screenshots/。你当前在 worktree 分支 t02-host-live-chat-loop。

本票对照截图 01 底部 Composer 区。从零确立 Seam-1（IPC 契约 = 渲染层唯一
事件源，chat reducer 为纯函数），契约类型设计克制、后续所有票都踩它。Pi SDK
以锁定版本 npm 依赖引入（ADR-0005）；本票需要跑真 Electron 验证流式闭环。

流程：开工前把工单 Status 改为 claimed → TDD 红绿循环 → UI 文案全英文 →
完成后跑 code-review → 提交到当前分支（不要自行 checkout/merge main，
提示操作者在主工作区执行 git merge --no-ff t02-host-live-chat-loop）→
工单 Status 改为 ready-for-human 并在 ## Comments 记录提交 sha。
```

---

## T03 — 聊天主线程全量（阻塞：02 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-03-chat-thread-full -b t03-chat-thread-full
cd .worktrees/wt-03-chat-thread-full && npm install
```

```text
/implement .scratch/picode-1-0/issues/03-chat-thread-full.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t03-chat-thread-full。

本票对照截图 01/04 的信息密度与层级：markdown+代码高亮、工具卡片、思考折叠
行、Working·Ns 进度行、消息操作行、错误态。Seam-1 reducer 每类契约事件都要
表驱动测试含错误路径；并行期共享契约只增不改。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t03-chat-thread-full）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T04 — 会话体系与侧边栏 + Live Follow（阻塞：02 已合入；可与 03/06 并行）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-04-sessions-sidebar -b t04-sessions-sidebar
cd .worktrees/wt-04-sessions-sidebar && npm install
```

```text
/implement .scratch/picode-1-0/issues/04-sessions-sidebar-live-follow.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t04-sessions-sidebar。

本票对照截图 01/02 左栏形态：任务列表按项目分组、⌘N、resume/fork/树导航、
label 重命名写回、Live Follow 只读实时跟随（零写入，Handoff 语义见
CONTEXT.md；并发不仲裁是已定策略）。若需演示 dev app，先确认没有其他
worktree 正在跑 Electron（AGENTS.md serialization 规则）。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t04-sessions-sidebar）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T06 — 面板容器 + Review 标签（阻塞：02 已合入；可与 03/04 并行）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-06-panel-review -b t06-panel-review
cd .worktrees/wt-06-panel-review && npm install
```

```text
/implement .scratch/picode-1-0/issues/06-panel-review-tab.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t06-panel-review。

本票对照截图 03 的空态两卡构图（本产品只有 Review/Terminal 两卡，无浏览器）
与面板容器交互：开合、多 tab、拖宽。Review = git 工作区 vs HEAD 全量 diff，
unified 默认、split 切换、per-file diffstat、只读无提交按钮；千行 diff 滚动
性能有验收线。共享契约只增不改。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t06-panel-review）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T05 — Composer 全量 + 审批闸门（阻塞：03 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-05-composer-approval -b t05-composer-approval
cd .worktrees/wt-05-composer-approval && npm install
```

```text
/implement .scratch/picode-1-0/issues/05-composer-pro-approval-gate.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t05-composer-approval。

本票对照截图 06 的 `/` 命令菜单形态（模糊过滤+键盘导航）。范围：@ 文件补全、
/ 菜单（Pi prompts+skills+内置命令）、图片粘贴、Steer/Follow-up 显式选择与
队列面板、provider→model 级联菜单、Thinking Level 下拉、Access Mode 芯片
（映射审批闸门预设档位，不是 trust 本身）、内联 approve/deny-with-reason
审批药丸与 remember 规则。全部对真 SDK 生效。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t05-composer-approval）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T07 — 文件预览标签（阻塞：06 已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-07-file-preview -b t07-file-preview
cd .worktrees/wt-07-file-preview && npm install
```

```text
/implement .scratch/picode-1-0/issues/07-file-preview-tab.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t07-file-preview。

本票对照截图 08 右栏预览形态：markdown 渲染 + 代码高亮 + 面包屑导航；
消息流文件改动卡与 Review 文件树 deep-link 直达预览；大文件策略明确。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t07-file-preview）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T08 — 终端 PTY + 桥接（阻塞：06 已合入；可与 07 并行）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-08-terminal-bridge -b t08-terminal-bridge
cd .worktrees/wt-08-terminal-bridge && npm install
```

```text
/implement .scratch/picode-1-0/issues/08-terminal-pty-bridge.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效（尤其 ADR-0004
PTY+桥接）；spec 在 .scratch/picode-1-0/spec.md；截图基准在
.scratch/reference/screenshots/。你当前在 worktree 分支 t08-terminal-bridge。

Seam-3 先行：fake-pty 接口上 TDD 投屏/resize/退出路径，真 PTY 只留一条冒烟
脚本。Bridge 单向：agent bash 输出投屏进终端视图，用户输入永不回注执行流。
终端主题与应用观感一致；需要跑真 PTY/Electron 时遵守 serialization 规则。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t08-terminal-bridge）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T09 — Usage 聚合器（无阻塞；随时可开工，纯函数无 UI）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-09-usage-aggregator -b t09-usage-aggregator
cd .worktrees/wt-09-usage-aggregator && npm install
```

```text
/implement .scratch/picode-1-0/issues/09-usage-aggregator.md

规矩：CONTEXT.md 是术语权威；ADR-0002 是数据源决策（Pi Session jsonl 唯一
来源）；spec 在 .scratch/picode-1-0/spec.md（Seam-2 是本票唯一缝）；截图
基准在 .scratch/reference/screenshots/。你当前在 worktree 分支
t09-usage-aggregator。

本票无 UI、不启动 Electron（serialization 规则天然满足）。fixture 表驱动：
正常流、追加式增长、compaction 条目、半行截断；真实历史会话抽样人工核对；
增量扫描幂等不双计；Estimated Cost 字段永远携带估算标记；聚合结果类型稳定
到可被图表直接消费。

流程：Status→claimed → TDD → code-review → 提交当前分支（不自行 merge，
提示操作者 git merge --no-ff t09-usage-aggregator）→ Status 改
ready-for-human + Comments 记 sha。
```

---

## T10 — 用量统计页（阻塞：09 与 01 均已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-10-usage-page -b t10-usage-page
cd .worktrees/wt-10-usage-page && npm install
```

```text
/implement .scratch/picode-1-0/issues/10-usage-page.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t10-usage-page。

本票对照截图 09 整版结构：设置窗口壳（导航分组裁剪为 General/Appearance/
Models/Data & Statistics）+ 五数字卡 + 热力格（daily/weekly/cumulative）+
近7/30日切换的每模型折线 + 环形占比 + 下钻 Session 明细。图表只消费聚合
缓存类型（Seam-2 产出），绝不现场扫文件；成本处处带 estimated 标注。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t10-usage-page）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T11 — 设置面板 + 全局打磨（阻塞：04、05、10 均已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-11-settings-polish -b t11-settings-polish
cd .worktrees/wt-11-settings-polish && npm install
```

```text
/implement .scratch/picode-1-0/issues/11-settings-polish.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t11-settings-polish。

范围：per-provider 只读 auth 状态视图（未配置给"去 TUI 登录"引导）、默认
模型/思考等级/启动偏好（影响新 Session 默认值）、外观变量占位（暗色只留位）、
⌘K 仅搜任务（键盘全程可达）、全局 toast/错误与空态体系。收尾时全界面走查
空态/错误态一遍。

流程：Status→claimed → TDD → 全英文文案 → code-review → 提交当前分支
（不自行 merge，提示操作者 git merge --no-ff t11-settings-polish）→
Status 改 ready-for-human + Comments 记 sha。
```

---

## T12 — 终局像素 QA + 发布准备（阻塞：07、08、11 均已合入）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-12-final-qa -b t12-final-qa
cd .worktrees/wt-12-final-qa && npm install
```

```text
/implement .scratch/picode-1-0/issues/12-final-qa-release-prep.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0005 全部有效；spec 在
.scratch/picode-1-0/spec.md；九张截图基准在 .scratch/reference/screenshots/。
你当前在 worktree 分支 t12-final-qa。

视觉红线终审：逐屏比对九张截图，偏差记录归档（修复或标注豁免理由，豁免需
所有者确认）；兼容冒烟套件（host 契约/真 SDK 流式/PTY/Usage 聚合/TUI↔SDK
会话互通）单命令跑绿并纳入仓库脚本；本地打包脚本 + 产物启动验证；README/
AGENTS 文档收尾。需要跑 dev/e2e 时遵守 serialization 规则。

流程：Status→claimed → TDD → code-review → 提交当前分支（不自行 merge，
提示操作者 git merge --no-ff t12-final-qa）→ Status 改 ready-for-human +
Comments 记 sha。
```

---

## 附：完成后验收（操作者手工环节）

1. 合并前在 worktree 里跑 `npm run dev` 对照该票截图亲自过目（Q15 红线）；
2. 合并：`cd ~/PiCode && git merge --no-ff t<NN>-<slug>`；
3. 有其他活跃 worktree 时逐个 `git rebase main`；
4. 票的 Status 已是 ready-for-human → 你验收满意后把 Status 改为
   `resolved`（或直接进入下一票，验收随里程碑一起做）。
