# PiCode — 从 0 到 MVP 的进程计划

> 目标:一个能日常自用的本地 Electron GUI,内核是 Pi Agent(SDK/RPC),交互逻辑仿 ZCode(流式输出 + 工具执行可视化 + 会话树),视觉自洽不照抄。
>
> 约定:产物/验收标准锚点来自本机已核实的 Pi 0.84.2 事实;决策锚点见 `CONTEXT.md` 与 `docs/adr/`。

---

## Phase 0 — 可行性验证(0.5~1 天)✅ 已完成

**目标**:一次性钉死两个最高风险假设:① 能否干净外部驱动 Pi 捕获事件流;② 是否存在可行的"工具执行可视化 / 拦截"通道。

**结果(2026-08-25,工单 01 完成,见 `phase0/FINDINGS.md`)**:四个验收标准全绿——真实 SDK 在 fork 子进程里往返 258 条流式 `text_delta` + 2 条 `bash` 工具执行生命周期,干净退出无孤儿;**并证明存在可用的 per-execution 审批/拦截通道**(extension `tool_call` + `ToolCallEventResult.block`,以及 `ctx.ui.confirm()` 经 `bindExtensions` 桥接),全程只用公共导出 API、不修改安装的 Pi。

**结论已固化为 spec 修正**:MVP 的"show, don't intercept"默认被推翻,**审批闸门纳入 MVP(工单 03,在工具面板 04 之前)**。

> ⚠️ 硬约束(同时生效):**整个项目不允许修改安装的 Pi Agent**——只读消费 `@earendil-works/pi-coding-agent` 及其 `~/.pi/agent` 配置,不 patch 安装。见 `CONTEXT.md` Decisions 与 ADR-0002。

---

## Phase 1 — 工程脚手架 + 最小闭环(2~3 天)✅ 已完成(工单 02)

**目标**:Electron + React 壳跑通,Phase 0 的 SDK 子进程接进主进程,形成"启动 → 看到流式输出"的最小闭环。已核验:选目录 → fork host → 流式上屏 → 干净退出全链路,见工单 02 记录与 `scripts/smoke-*.mjs`。

**步骤**:
1. 脚手架(Electron Forge / Vite),目录骨架:
   ```
   src/
     main/        # Electron 主进程:会话/进程生命周期、IPC
     preload/     # contextBridge 暴露安全 API
     renderer/    # React UI
     child/       # 子进程入口:createAgentSession 宿主(ADR-0002)
   ```
2. 主进程内 `sessionService`:启动子进程、subscribe 事件、submit prompt、abort、进程清理。
3. 主↔渲染增量 IPC 通道(先最简)。
4. 渲染层第一屏:输入框 + 逐字追加的流式输出区。

**验收标准**:启动 App → 输入一句话 → 模型回答**逐字流式**上屏;退出时子进程被干净回收,无残留。

---

## Phase 2 — 核心体验 = MVP(3~5 天)✅ 收尾(工单 06 已完成)

**目标**:补齐工具执行可视化 + 审批闸门 + 会话树 + 状态/设置展示 + 文件改动 diff,达到**可日常自用**。

**当前进度(2026-08-25)**:工单 01–07 **全部实现并标 `resolved`**(见 `.scratch/picode-mvp/issues/` 与各工单 Answer)。工单 06(文件改动 diff 视图)为 MVP 最后一个缺口,已关闭——见 `.scratch/picode-mvp/issues/06-file-change-diff-view.md`。
1. **审批闸门(工单 03,前置)**:工具执行前,渲染层出现 allow/deny;经自定义 `ExtensionUIContext` 桥回 host 的 `tool_call` handler block/放行,支持 deny 原因与 per-tool 已存默认(只用公共 API,不改 Pi)。
2. **工具执行面板(工单 04)**:`tool_execution_start/update/end` 渲染为可折叠卡片(工具名、参数、状态 progress→done/error),支持 abort。
3. **流式输出升级**:text delta 渲染为 markdown;文件改动展示为轻量 diff(先做"新增/修改文件列表 + 简要 diff",不做实时逐字符 overlay)。
4. **会话树侧边栏(工单 05)**:读 `~/.pi/agent/sessions/` JSONL(只读真相源),列出树,支持 new/resume/fork;展示当前 model/provider/thinking level。
5. **文件改动 diff(工单 06)**:回合内 Pi 改动的文件列表 + 轻量 diff。
6. **信任口径展示 + 设置面板(工单 07)**:`defaultProjectTrust` 与 `--approve`/`--no-approve` 做进设置;provider / model / thinking level 切换(走 SDK `setModel` 等)。注意:Pi 的 trust 是"加载项目资源"的闸门,**独立于**本项目的工具审批闸门——二者并存、互不混淆。

**验收标准**:一个完整回合"输入 → 思考 → 工具执行 → 输出 → 文件改动"全程可视化;可换模型、建/续/分会话;具备日常自用条件。

---

## Phase 3 — 可选(超出 MVP)

原生终端面板、实时 diff overlay、多会话并发 pane、远程 socket 控制面(ADR-0002 远期方向)、打包分发(签名/更新)。不进 MVP 门槛。

---

## 时间量级(个人全职)

- Phase 0:0.5–1 天
- Phase 1:2–3 天
- Phase 2:3–5 天
- **MVP 全链路:约 1~1.5 周**

比最初"person-month"判断宽松的原因:事实核查确认 SDK 是官方一等公民、事件契约完整,子进程化走通,核心路径干净。审批闸门经 Phase 0 证明可行后已纳入 MVP(工单 03),不再是未知风险的负担——它是在已证实的公共通道上实现的,不改变整体量级。

---

## 关键决策锚点

| 决策 | 出处 |
|---|---|
| 直接驱动 Pi,不包装 ZCode | `docs/adr/0001` |
| SDK 子进程 + IPC(备选原生 RPC,socket 为远期) | `docs/adr/0002`、`CONTEXT.md` |
| **不允许修改安装的 Pi(只读消费)** | `CONTEXT.md` Decisions、ADR-0002 |
| 全 TS、JSONL 只读真相源、单工作目录、MVP 单活跃会话 | `CONTEXT.md` |
| **MVP 含 per-execution 审批闸门**(Phase 0 已证实通道) | `CONTEXT.md` Decisions、spec"Tool-approval model" |

## 下一步

1. **frontier = 收尾核对**:工单 01–07 全部 `resolved`,对照 spec.md 的 User Stories 做一次 spec↔实现的逐条核对收尾(MVP 全链路完成)。06 的记录与验证见 `.scratch/picode-mvp/issues/06-file-change-diff-view.md`(含 `npm run e2e:file-diffs` 真实 SDK 端到端)。
2. 后续候选(超出 MVP):Phase 3 的终端面板 / 实时 diff overlay / 多会话并发 / socket 控制面 / 打包分发。
3. 终极验收:运行 App 完整走一个"输入 → 思考 → 工具执行 → 输出 → 文件改动 diff"的回合,确认日常自用条件。
