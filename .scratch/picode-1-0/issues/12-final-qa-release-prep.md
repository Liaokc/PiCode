# 12: 终局像素 QA + 发布准备

**What to build:** 视觉红线终审：对照 `.scratch/reference/screenshots/` 九张基准逐屏比对修正视觉漂移（间距、圆角、字重、色值、动效手感），形成记录归档；完整兼容冒烟套件跑绿（host 契约、真 SDK 流式、PTY、Usage 聚合、TUI↔SDK 会话互通）；本地打包脚本交付。

**Blocked by:** 07 文件预览标签、08 终端 PTY + 桥接、11 设置面板 + 全局打磨。

**Status:** ready-for-human

- [x] 九张截图逐屏比对记录归档，偏差修复或经所有者明确豁免
- [x] 冒烟套件单命令跑绿并纳入仓库脚本
- [x] 打包产物本机可启动运行一轮真实会话
- [x] README/AGENTS 文档收尾，工单全量勾选

## Comments

### 2026-08-28 — implementing session (branch `t12-final-qa`, commit `bba9d40`)

**Delivered on `t12-final-qa` @ `bba9d40`**（未自行 merge — 请操作者执行 `git merge --no-ff t12-final-qa`）。

**1. 视觉红线终审** — 记录归档于 `.scratch/picode-1-0/visual-redline-final.md`，九屏逐屏比对（截图在 `.scratch/visual/`，全部为本工单新鲜捕获）。终审抓到并修复 **4 个真实缺陷**：

- **自 ticket 05 合并起，composer 弹层/审批 pill/队列面板整体无样式**（`.side-panel:hover::before` 缺右花括号，CSS 嵌套语义吞掉了后续全部规则；已提交的旧截图静默记录了坏状态）。补花括号修复。
- **Usage 热力图月份标签重叠**（"ApMay"）— `heatmapGrid` 让局部首周标签让位，双模式单测覆盖。
- 快捷 chips 缺少前导图标（对照 02 号图补齐，自绘 SVG，未复制 ZCode 资产）。
- Markdown 代码块底色（灰底 → 白底细边框，对照 06 号图）。
- 另修复视觉 harness 自身的竞态：terminal 捕获曾因 fake cwd 挂掉用户 shell（exit 1）。

**10 项偏差按规格列为豁免，等待所有者逐条确认**（浏览器标签、ASK/init 芯片、Git 工具面板→Review、导航裁剪、英文文案、消息操作仅 Copy+时间戳、模型菜单无管理项、预览无改动高亮、热力图时长为数据差异、水印为自有 π 标）。详见记录文档"Exemptions"节。

**2. 冒烟套件** — `npm run smoke` 单命令 6 阶段全绿（74s，本机实测）：build → host 契约（真 SDK 流式 56s）→ PTY → Usage 聚合（真实 TUI 存储只读扫描 + 临时库增量机制）→ TUI↔SDK 互通（双向：TUI 会话经 index/transcript/SDK SessionManager 解析；host 写出的会话经 SDK 复开、入索引、入 Usage、二次 host resume）→ Electron 应用冒烟（DOM/侧栏/Live Follow/崩溃隔离）。新脚本：`scripts/smoke/{run-all.sh,usage-smoke.ts,interop-smoke.ts}`，含分阶段计时与 fail-fast。

**3. 打包** — `npm run package`（@electron/packager，本地未签名 .app，asar 关闭以允许 fork host）→ `npm run package:verify` 实测：**打包产物启动并完整跑通一轮真实会话冒烟**（真 SDK 流式/中断/崩溃隔离/Live Follow，exit 0）。

**4. 文档** — 新增 `README.md`（架构、开发、smoke、视觉 QA、打包）；`AGENTS.md` 增加 Verification & release 命令节。

验收自查：`npm run typecheck` / `npm run lint` / `npm test`（442 通过）全绿；冒烟套件与打包验证见上。**待所有者**：确认 10 项豁免 + merge。
