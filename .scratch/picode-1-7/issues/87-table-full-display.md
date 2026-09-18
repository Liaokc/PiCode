# 87: 表格完整展示——去高度压缩 + 删 preview 浮层

**What to build:** 转录中 markdown 表格**完整展示**：①去掉表体 360px 高度压缩——表体自然高度随转录流渲染（转录自身滚动），宽表保留横向滚动；②**删除 md-table-preview 浮层与 eye/expand 钮**（完整展示后成死 UI；「表格 fullscreen 维持不做」豁免同步维持）；③工具栏只剩 复制 / CSV / TSV。

**背景（取证）：** `.md-table-scroll { max-height: 360px }`（`app.css:5104` 区段）+ `md-table-preview` 浮层（Markdown.tsx 表格段，"View the table in a larger, scrollable view"）；ZCode 参照帧 `z-table-hover`：表体完整展示、宽表横向滚。操作者拍板（Q2）：去 cap + 删浮层 + 工具栏三钮。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] 长表格自然高度完整展示（无内部纵向滚动），转录流滚动阅读（electron smoke `table_full_display_ok` + visual 帧 `2c-table-full.png`：12 行长表容器实测 520px 级 > 旧 360px cap、`max-height:none`、零内滚）
- [x] 宽表横向滚动保留（列不挤压）（smoke + visual 双断言 `wideHScroll`：80 字符不可断行 token 三列 → min-content ~1750px 越过面板，容器 `scrollWidth > clientWidth`；帧 `2c-table-wide-hscroll.png`）
- [x] preview 浮层 / eye 钮 / expand 钮删除；工具栏 = copy / CSV / TSV（功能不回归）（smoke `table_tools_row_ok` 断言 aria-label 序列恰为三钮；`table_copy_markdown/csv/tsv_ok` 真实剪贴板三载荷逐字节过；preview-reader chrome 探针 3 钮/表 + 9 tooltip 触发器）
- [x] DiagramCard（图卡）等 markdown 其他围栏渲染零回归；深色主题纪律不变（mermaid 浅色先例）（DiagramCard 零改动，仅 BlockUiState 收缩为 copied/wrapped——DiagramCard 只消费 copied/markCopied；mermaid smoke stage + visual 帧原样全绿）
- [x] vitest / typecheck 全绿（1517/1517 + 双 tsconfig 清）；跑 dev app / smoke 前 `ps` 自查（dev-app serialization；两次自查均无其他 PiCode Electron/dev-app/smoke 进程）

## Comments

- 2026-09-18 (implement session)：三件全落地，纯 renderer + 纯删减，零契约增量。
  - **去 cap**：`app.css` `.md-table-scroll` 删 `max-height: 360px`，容器只保留横向 overflow（注释钉死「表体自然高度、转录流拥有纵向滚动」语义）；`.md .md-table-scroll-expanded` 规则随之删除。CSS 其余（`min-width: 100%` 满卡、单元格分隔线）原样。
  - **删浮层 + 双钮**：`Markdown.tsx` TableCard 删 `previewing` state、Escape 监听、eye/expand 两钮与整段 `md-table-preview*` 浮层 JSX；`BlockUiState` 收缩（`expanded`/`toggleExpanded` 移除——全仓唯一消费者就是表格 expand，DiagramCard 只用 copied/markCopied，已核）；app.css 七条 `.md-table-preview*` 规则删除；nav-rail z-index 纪律注释里的「fixed md-table preview backdrop」例举同步改为「fixed diagram-fullscreen overlay」（同为 body 级 fixed portal，z-index 85，语义不变）。eye/expand 图标中 `ExpandArrowsIcon` 全仓再无消费者（保留在 icons.tsx 导出， EyeIcon 仍被 PreviewTab 使用）。
  - **双 harness 更新**：smoke ticket-60 stage ② 工具行断言改三钮序列（fixture 加宽表 → 2 表 6 钮），④ 预览/expand 回归段替换为 ticket-87 全展示断言（`max-height:none` × 全部容器 + 零内滚 + 宽表横向溢出）；visual.ts 流式 fixture 换 12 行长表（旧 cap 下必内滚）+ 追加宽表（80 字符不可断 token ×3 列，min-content ~1750px，越窗确定性的横向滚），2b/2c 段 expand/preview 探针替换为全展示几何断言 + 两帧（`2c-table-full` / `2c-table-wide-hscroll`），preview-reader 4b 探针 5→3 钮、tips 11→9，4c-preview-table-preview / expand 段删除。死证据帧 `2c-table-preview.png`、`4c-preview-table-preview.png`（浮层已不存在）git rm。
  - **顺手修一个阻塞级 pre-existing harness 缺陷（pi16，非本票范围，报备）**：`visual:transcript` 的 4e/4f（ticket-69 级联菜单 stage）自 ticket-76 起确定性红——4e 期望当前 provider 高亮在发出序 index 11，但 ticket-76 的 `sortProvidersConfiguredFirst`（App.tsx chatForView）把配置过的 bella 排到渲染列 row 0，组件高亮行为本身正确，stage 预期过期。基线复现实证：stash 本票全部改动后基线跑同样报 `{"count":14,"selected":0,"ok":true}`。修复只动 harness：current 改为 prov-13（未配置 → ticket-76 排序后落在最末行 13），并用 composer_state 钉住 current（chat reducer 的 `state.model ?? event.current` 不会被 models_available 覆盖已设 model——ticket-05 段已把 bella 钉在同一焦点会话上），「开启时自动定位深行当前 provider」的 stage 意图原样保留（现在测的是排序后 row 13 的深行定位 + 4f 末行 clamp）。不改任何产品代码。
- 2026-09-18 (verification)：vitest 1517/1517 绿；typecheck 双 tsconfig 清；本票三文件 eslint 清（全仓 lint 的 4 error/1 warning 全部位于他票遗留文件：t86 capture-86.mjs、t79 draft-captures.mjs、packages-service.test.ts、EmptyState warning——非本票引入）。`npm run visual:transcript` **全量绿至 VISUAL done**（含修复后的 4e/4f；probe 2c-table-full = `{"count":2,"maxHeights":["none","none"],"vOverflow":false,"longTallerThanCap":true,"wideHScroll":true}`）。`npm run smoke:electron` **全量绿至 SMOKE done**（ticket-44 真实剪贴板本机通过；新断言 `table_tools_row_ok` / `table_copy_markdown_ok` / `table_copy_csv_ok` / `table_copy_tsv_ok` / `table_full_display_ok` 全过；其间一次 bg_approval tripwire 90s unhandled-rejection 警告为 smoke 自身 waitFor 既有噪声，不判败、运行继续）。证据帧：`.scratch/visual/2c-table-full.png`（长表完整展示）、`.scratch/visual/2c-table-wide-hscroll.png`（宽表横向滚）、`2b-code-wrapped.png` / `3-expanded.png` / `4b-preview-chrome.png`（三钮工具行 + 零浮层）。**操作者：`bash scripts/merge-ticket.sh 87`。**
- 2026-09-18 (code-review，两轴并行子代理，merge verdict 双 OK)：Standards 轴零 documented-standard 违例，三条 P2 判断题——①Markdown.tsx 头注释残留 "expanded" 字样（已修，删除该词）；②`ExpandArrowsIcon` 成无消费者导出（**裁决保留**：icons.tsx 已有同态先例 HashIcon 零消费者，图标库文件保持 unused 导出属常态，且并行 worktree 在飞时共享文件做删减是更险方向——加法安全优先）；③visual.ts 两理由同文件（票 87 表格 + 票 69 harness 修缮）= Divergent Change 判断题，harness-only + 基线复现 + Comments 报备在案，判可接受。Spec 轴：R2 三项全过、无缺失无部分实现；4e/4f 修缮与两张死证据帧删除均判「justified, not creep」；一条 P2 note——smoke stage ④ 的 `scrollHeight <= clientHeight + 1` 腿对本 stage 的 2 行 fixture 恒真（高度证明实际由 `max-height === 'none'` 断言承担、长表真证明在 visual harness）——判 belt-and-suspenders 可留，不改。
