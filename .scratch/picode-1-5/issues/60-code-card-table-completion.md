# 60: 代码卡与表格补齐——行号/下载/startLine + CSV/TSV

**What to build:** 代码卡补齐 ZCode 实证能力：**行号默认开**（模型可用 noLineNumbers 元参数关闭——所有代码卡视觉密度变化，操作者明知拍板）、**download 钮**（按语言推导扩展名存文件）、**startLine=N 元参数**平移起始计数；表格工具排增 **copy as CSV / copy as TSV** 两项（既有 copy as Markdown / preview / expand 三钮零回归）。表格 fullscreen 维持不做（ZCode 自身显式关闭）。

**背景（取证）：** ZCode 代码卡 = 行号默认（noLineNumbers 关）+ startLine=N + download/copy 双钮；表格 copyTable 家族 = copy / Markdown / CSV / TSV 四格式。PiCode 现状：代码卡无行号无下载；TableCard 仅 Markdown copy/preview/expand。

**Blocked by:** 59（同文件串行：Markdown 块投影与卡组件——59 先引入图卡投影基座，本票在其上补代码卡/表格能力）。

**Status:** ready-for-human

- [ ] 行号投影表驱动：默认开 / noLineNumbers 关 / startLine=N 平移计数（含与既有 wrap/copy chrome 共存）
- [ ] download 钮：按语言推导扩展名存文件；与既有 copy 钮并排
- [ ] 表格 CSV/TSV 序列化纯函数 + 工具排两项新钮（全英文 tooltip）
- [ ] 既有 copy as Markdown / preview / expand 零回归（表驱动 + smoke 断言）
- [ ] electron smoke：行号显示 + download + CSV copy
- [ ] visual harness：行号帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 60`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R4 的代码卡/表格部分，Q6=C + Q11=A「全做，越完美越好」）。波次 W2，**Blocked by 59**。

- 2026-09-11 (implement, t60-code-card-table @ 3fa04ac + 86be20a): 全验收项落地，全门绿。
  - **Seam-1 投影全表驱动**（`src/shared/markdown-blocks.ts`，+22 表 42 例）：`parseFenceMeta`（noLineNumbers 裸旗标 + startLine=\d+；畸形降级默认）/ `fenceMetaOfNode`（读 hast code 子元素 `data.meta`——mdast-util-to-hast 落位、rehype-highlight 原地改写不丢，实测验证）/ `codeLineNumbers`（默认 1..N / startLine 平移 / 旗标关）/ `codeBody`（高亮 hast 按逻辑行拆 token，跨行 token 逐行重开类名，尾随换行不渲染多余行）/ `tableToCsv`+`tableToTsv`（一个 RFC-4180 形序列化器按分隔符参数化，与 markdown copy 共用行/单元格走查——既有输出零字节变化）/ `codeFileExtension`+`codeFileName`（已知语言→规范扩展名，未知安全 token 自映射，敌意输入降级 txt）。vitest 1159/1159（81 文件）。
  - **代码卡**（`Markdown.tsx` CodeBlockCard 重构）：行号默认开——高亮体按逻辑行重建，每个行块内联携带自己的行号（hanging indent：padding-left + 负 text-indent，wrap 下续行不钻入行号列）；gutter `user-select:none` + aria-hidden，复制载荷仍是原始源码；`--md-lineno-w` 按最大数字位宽逐卡设定。download 钮（Download code）与 copy 并排（ZCode download+copy 证据序），锚+blob 路径抽到共享 `download.ts`（DiagramCard 同源去重）。noLineNumbers 时整卡无 gutter、纯行块，与旧渲染同形。
  - **表格**（TableCard）：copy family 补齐——Copy（markdown，不动）/ **Copy as CSV** / **Copy as TSV**（text chip 钮，全英文 tooltip）/ Preview / Expand 原样；三个 copy 钮各自独立 ✓（复合 key `<block>:csv|tsv`，与数值 key 空间零碰撞）。
  - **electron smoke**（ticket-60 段，contract-stream 结构化回放、无模型调用）：三栅栏（typescript 默认 1..4 / `js startLine=41`→41..43 / `text noLineNumbers` 零 gutter）+ 一张 GFM 表——逐卡行号值断言、五钮工具排断言、**真实剪贴板**三格式精确载荷（markdown 零回归 + CSV 引号加倍 + TSV）、preview 开/关 + expand aria-pressed、**真实 will-download**（主进程捕获即取消，零磁盘写入）携带 `snippet.ts` + blob 精确载荷。全套 `npm run smoke` **ALL GREEN**（240s，6 stages；一次 hygiene FAIL 系并行 worktree 会话文件增长所致——wt-65 实施会话，非 smoke 泄漏，复跑即绿；ticket-25 bg-deny 一处真实模型 flake 复跑自愈，非本票引入）。
  - **visual harness**：`npm run visual:codecard`（PICODE_VISUAL_CODECARD=1，断言式探针）——cc1-code-line-numbers.png 帧入库（默认 gutter / startLine=41 / 无 gutter 三卡同框）；cb1（chrome 钮 2→3，票 60 有意变更）、mm1/mm3（回退源码卡带行号）重生成；README Visual QA 补行。visual:mermaid 全探针复跑绿（票 59 零回归）。
  - **契约分类**：无契约增量（纯渲染层投影与序列化，IPC/契约面零触碰）；无新术语（票 60 未列词条项）；表格 fullscreen 维持不做（ZCode 自关）。
  - **gate 终态**：typecheck 绿；lint 0 error（EmptyState 既有 warning 非本票）；vitest 1159/1159；smoke ALL GREEN；visual 三套（codecard/codeblock/mermaid）全绿；**code-review 双轴完成**——Standards 抓出 copy 反馈形状三处重复（Duplicated Code）→ 86be20a 收敛为单一 `copyWithFeedback` + 复合 key 约定注释；Spec 八验收项逐条对上，零 scope creep。
  - **ps 自查**：每次应用通道（smoke ×3、visual ×3）前执行，全程零并跑。
  - **交接给合并会话**：完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 60`。注意 root 拉 main 后需 `npm install` 同步（59 的 mermaid 依赖先例）。
