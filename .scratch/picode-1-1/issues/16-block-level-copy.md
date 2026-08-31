# 16: 转录供面——代码格卡片 / 表格容器 / 消息操作行

**What to build:** 转录区 markdown 块级与消息级供面对齐 ZCode（2026-08-31 实机比对 + grilling 定稿）：
(a) **围栏代码块卡片化**：卡片容器（圆角边框），头部行 = 语言标签（左）+ **自动换行 toggle**（右，hover 文案「自动换行」，与 File Preview 换行开关同语义）+ **复制按钮**（右，hover「复制」；点击复制原文、成功反馈约 1.5s 后恢复）。
(b) **表格容器化**：表格包卡片容器，上方右侧**常驻**三枚操作钮（hover 短文案，文案照抄 ZCode）：**⧉ 复制 / 预览表格 / 展开表格滚动区域**。
(c) **消息操作行**：落定 assistant 消息操作行从「Copy + 时间戳」扩为 **Copy + 🔀 fork + 时间戳**：点击 🔀 以该消息为分叉点调既有 `fork_session`，**自动切换到新会话** + toast「已分叉」。
(d) 流式兼容：PiCode 流式逐 delta 重解析 markdown，块级卡片与按钮在流式中稳定存在、重挂载不闪烁。

**不做（grilling 明确排除）**：表格「下载」导出；代码格「终端钮」（语义未确证）；消息 👍👎（Pi 无反馈 API）与 ⚓（ZCode 特有的打断 hook 标记）。

**背景（证据）：**
- 操作者报告：正文中的代码块/表格没有复制按钮，只有整条消息的 Copy——长代码/宽表格无法单独复制。
- PiCode 侧：`src/renderer/src/components/Markdown.tsx` 为裸 ReactMarkdown（无 components 覆写、零块级供面）；实机悬停表格无反馈（`.scratch/compare/pi-hover-table.png`）；resume 视图代码块同样无块级复制。
- ZCode 基准：代码格头部 = 语言图标+标签（左）+ 自动换行 + 复制（右，常驻，`z-ref-codecell-zoom.png`；自动换行语义由操作者指认）；表格卡上方右侧操作钮组（`z-table-hover.png`，四钮实拍，下载排除后做三钮）；消息操作行 = ⧉👍👎🔀(+⚓)+时间戳（`z-settled-message-actions.png`）。
- fork 数据链路现成：SDK `AgentSessionRuntime.fork(entryId)` + 契约 `fork_session`（ticket 04）。
- 实现建议：react-markdown `components` 覆写 `pre`/`table` 外层容器注入按钮；复制反馈状态需容忍流式重挂载（状态上提或 key 稳定）。

**Blocked by:** 22（按钮 tooltip 用统一组件的描述态；prefactor——“先让改动变容易”）。

**Status:** resolved

- [ ] 代码格卡片：语言标签行 + 自动换行 toggle + 常驻复制钮，hover 短文案；复制成功反馈 1.5s 后恢复
- [ ] 表格容器卡 + 三钮（复制/预览表格/展开表格滚动区域）+ hover 短文案；「预览」「展开」的实际形态以 ZCode 实机为对照
- [ ] 消息操作行：Copy + 🔀（fork at 该消息 → 自动切换新会话 + toast「已分叉」）+ 时间戳
- [ ] 流式输出中块级卡片不闪烁、不丢按钮（visual harness 流中帧核对）
- [ ] 键盘可达：Tab 聚焦各钮，Enter 触发
- [ ] `npm run visual:transcript` 全套重拍无回归；`npm run smoke` ALL GREEN
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake): 建票。取证证据：`.scratch/compare/pi-hover-table.png`（PiCode 表格悬停无反馈）、`.scratch/compare/z-ref-codecell-zoom.png`（ZCode 代码格常驻复制钮）。
- 2026-08-31 (第二轮): ZCode 表格实机取证补齐：四枚常驻操作钮，见 `.scratch/compare/z-table-hover.png`；取证会话「transform pipeline改造与upload_files文件路径入参新增」。
- 2026-08-31 (grilling 定稿): 范围改定——代码格加**自动换行 toggle**（操作者指认其语义）；表格三钮定稿（复制/预览表格/展开表格滚动区域，下载不做）；新增消息级供面：操作行加 🔀fork（自动切换+toast；👍👎⚓ 排除）；全部按钮 tooltip 用短文案（详见票 22）。
- 2026-08-31 (t16 implementation):
  - **实现 sha：`ff28b80`**（分支 `t16-transcript-affordances`，未自行 merge）。操作者合并：`bash scripts/merge-ticket.sh 16`
  - 实现：`Markdown.tsx` 以 module-scope `components` 覆写注入 `pre`/`table` 卡片（组件身份恒定，流式 delta 不换身份）；复制 ✓ / 换行 / 展开三态上提到 per-instance context，key = 块起始行列（`shared/markdown-blocks.ts#blockKey`）——流式重挂载不闪、状态不丢（visual harness 用 dataset 标记实证 `kept:2/marked:2`）。纯函数缝（语言标签/原文提取/块 key/表格→GFM）15 例表驱动测试。表格容器注意点：react-markdown 的 `table` 覆写替换的是 `<table>` 本身，children 是裸 thead/tbody，容器内须自建 `<table>` 包回（否则浏览器匿名表修正假布局、CSS 选择器落空）。预览阅读器 `chrome={false}` 保持裸排版（本票范围=转录区）。
  - fork：消息操作行 Copy + Fork + 时间戳；点击发既有 `fork_session`（host `announceCurrentSession(true)` 重播 → 自动切换）+ toast「Forked to a new session.」。toast 同时覆盖分支树面板 fork（同一动作同一反馈，注释已记）。
  - 文案全英文（Wrap lines / Copy / Preview table / Expand table / Fork from here→Fork 钮自label 无 tooltip per R3）；键盘可达（原生 button + focus-visible 外框）。
  - 验证：typecheck / eslint / vitest **501/501** 全绿；`npm run visual:transcript` 全套重拍通过，新帧 `1b-streaming-blocks`（流中卡+重挂载探针）、`2b-code-wrapped`、`2c-table-preview`、`2d-fork-toast`；`npm run smoke` **ALL GREEN**（6 stages）；code-review 双轴通过（Standards：修 3 处——fork 钮 R3 去 tooltip、toggle 去重、去多余 cast；Spec：无缺件）。
  - ⚠️ 留人工 visual QA：「预览表格」overlay 形态与键帽样式一样属「以 ZCode 实机为对照」的合理解释，请操作者实机比对；表格默认滚动区 max-height 360px、展开解除，如与 ZCode 实机不符可在本票返工。
- 2026-08-31 (t16 返工 — 操作者实拍对照)：操作者提供 ZCode 实拍两张（桌面 20.50.32 表格 / 20.51.26 表格预览），预览浮层按实拍返工，sha `1023d87`：
  - **表格样式对齐实拍**（转录区 + 预览阅读器共用 `.md` 规则）：只留横向分隔线、无竖线；表头无底色、常规字重、灰色左对齐；末行去底线避免与卡片边缘双线；单元格 padding 加到 9px 12px。
  - **预览浮层对齐实拍**：去标题分隔条；标题下加灰色说明行「View the table in a larger, scrollable view.」（对应 ZCode「在更大的可滚动视图中查看表格。」英文版）；浮层内的表格直接复用转录区同款 `md-table-scroll` 圆角滚动容器；浮层收窄为 min(760px, 86vw)、圆角 14px、遮罩加深至 0.35。
  - 验证：typecheck / eslint / vitest 501/501 全绿；visual 全帧重拍通过（`2c-table-preview` 新帧已按实拍形态）。

- 2026-08-31 (merge session, T00): merged as **f184b6d** (`merge: t16-transcript-affordances`, rebase + no-ff onto main)。验收口径：操作者明确「已验收」（含返工轮：表格/预览浮层按操作者 ZCode 实拍 1023d87 对齐；「预览表格」overlay 形态已过人工 visual QA）。实现会话记录 vitest 501/501 + smoke ALL GREEN（6 stages）+ code-review 双轴通过；合并后 main 上 typecheck + vitest 501/501 全绿。冲突处置：仅 tracker 状态对撞（中间提交 claimed/部分评论 vs main 终态，取终态），零代码冲突。
