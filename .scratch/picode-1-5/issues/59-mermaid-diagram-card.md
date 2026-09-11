# 59: mermaid 图卡——围栏闭合渲染 + 全套操作钮

**What to build:** ```mermaid 围栏**闭合**且解析成功 → 渲染**图卡**（Diagram Card）：小写 mono "mermaid" 标签头 + 右上 sticky 操作钮组（download SVG/PNG/MMD 下拉菜单、copy 源码、fullscreen）+ 渲染体 panZoom；fullscreen 为根层浮层、Esc 退出。**流式未闭合**按普通代码卡显源码（mermaid 需全文才能解析）；**解析失败回退源码卡**（lang=mermaid 标签照常），不弹错误 toast（Q7 拍板）。新增 mermaid npm 依赖，按图型懒加载分片不进主包（ZCode 同型）。

**背景（取证）：** ZCode bundle 实证（streamdown 管线 `data-streamdown:"mermaid-block"`）：头部小写标签 + download（三格式）/copy/fullscreen + panZoom 全默认开；lazy Suspense 按图型分片全家桶。操作者真实用例实锤（01a0801b 会话完整 flow TD 图，PiCode 现只能看源码）。Q6 拍板 C 全家庭——本票是其中 mermaid 部分。

**Blocked by:** None (can start immediately).（需网络装依赖）

**Status:** ready-for-human

- [x] 围栏卡型投影纯函数：mermaid 闭合+解析成功 → 图卡 / 流式未闭合 → 源码卡 / 解析失败 → 源码卡回退（表驱动）
- [x] mermaid 依赖接入：懒加载分片（动态 import），主包零增量；渲染主题用库默认浅色（深色范围外）
- [x] 图卡 UI：小写 mermaid 标签头 + download（SVG/PNG/MMD）+ copy 源码 + fullscreen（根层浮层、Esc 退）+ panZoom
- [x] electron smoke：种子会话 mermaid 渲染图卡 + copy 源码 + 坏图回退源码卡
- [x] visual harness：图卡帧
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 59`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R4 的 mermaid 部分，Q6=C + Q7 按推荐 + Q11=A）。波次 W1（需网络装依赖）。**60 强串行于本票**（同文件：Markdown 块投影与卡组件）。术语「图卡（Diagram Card）」随票入 CONTEXT.md。1.4 范围外项转正（票 50 仅做了最小标签对齐）。

- 2026-09-11 (implement, t59-mermaid-diagram-card @ 84f2207 + 3bbad96): 全验收项落地，全门绿。
  - **Seam-1 围栏卡型投影**（`src/shared/markdown-blocks.ts`）：`isFenceClosed(text, startOffset)`——从 pre 节点 position.start.offset（= 开栅线首字符，react-markdown 管线实证）扫描闭栅线的 CommonMark 闭栅规则（同字符、≥开栅长度、≤3 空格缩进、首个合法闭栅即闭合；无位置/越界 → false 安全降级源码卡）；`isMermaidLanguage`（trim+lowercase）；`fenceCardKind({lang, closed, parseOk})` 决策表——恰为「mermaid + closed + parseOk===true」出图卡。表驱动 3 组 20 例（isMermaidLanguage 7 / isFenceClosed 13 / fenceCardKind 7，含 4-backtick、~~ 互不闭合、部分闭栅流式态、防御行）。vitest 1131/1131（81 文件）。
  - **依赖接入**：mermaid 12.0.0（npm），全部接触收敛在 `src/renderer/src/components/mermaid-api.ts`（initialize startOnLoad:false / parse suppressErrors / render 序列化 id / svgToPngBlob viewBox 内在尺寸 ×2 白底栅格化）——**唯一入口是动态 import()**（DiagramCard 的 PNG 路径也是，code-review 抓出过一版静态 import 把 mermaid 拖进主包，已修）。构建实测：renderer index 2,372.34 kB → 2,390.92 kB（增量全为本票 UI 组件，dagre/cytoscape/flowchart 等符号 grep 为零）；mermaid-api 分片 1.18 MB + **按图型分片全家桶自动出炉**（flowDiagram/ganttDiagram/sequenceDiagram/classDiagram/cytoscape/elk/…，ZCode 同型）。主题库默认（initialize 不设 theme，浅色；深色范围外）。
  - **图卡 UI**（`DiagramCard.tsx`）：小写 mono mermaid 标签头（复用 md-code-lang 芯片）+ sticky 右上操作钮组：download（SVG/PNG/MMD 菜单，backdrop 式外点关）/ copy 源码（✓ 反馈 1.5s，走 BlockUi keyed state）/ fullscreen；渲染体 panZoom 视口（非 passive wheel 光标锚定缩放 0.2–8×、拖拽平移 pointer capture、右下 +/−/reset 角控件）；fullscreen = createPortal 根层浮层（fixed inset-0、z:85、role=dialog）Esc 退——单一 Esc 纪律：先菜单后浮层。渲染失败回退调用方传入的源码卡（Q7 零 toast）。Markdown.tsx：MarkdownTextContext（hast 树本身分不清 EOF 闭合与流式未闭合，投影要全文）+ FenceCard pre 分流 + MermaidFenceCard 解析状态机（keyed verdict 投影，无 effect-setState 级联，eslint react-hooks/set-state-in-effect 干净）。PreviewTab 同组件自动同享（one grammar of blocks）。
  - **electron smoke**：ticket-59 段（command_catalog 后，contract-stream 种子回放、无模型调用）：图卡渲染（svg+芯片+四钮组+缩放控件）/ 坏图+未闭合双回退源码卡（lang=mermaid 标签、零 toast）/ download 菜单三项 / **真剪贴板** copy 源码（焦点窃取舞步 + 精确围栏源串——注：rehype-highlight 规范化尾随一个 \n，断言按实收）/ fullscreen 根层浮层 + Esc 退。**全链 ALL GREEN**：`mermaid_card_rendered_ok` → `mermaid_fullscreen_esc_ok` 五步 + `multi_shutdown_no_orphans_ok 13 hosts` + `done`（fork_live 阶段一处既有 tripwire 90s unhandled-rejection 警告为票 20 既有模式，无害，非本票引入）。
  - **visual harness**：`npm run visual:mermaid`（PICODE_VISUAL_MERMAID=1，断言式违规 exit 1）——流式中首个闭合栅即出图卡（懒加载分片 20s 预算实测秒出）/ 双回退 / stub 剪贴板 copy 精确载荷 + ✓ / download 菜单 / fullscreen+Esc；三帧入库（mm1-diagram-card 菜单开帧、mm2-diagram-fullscreen 浮层帧、mm3-mermaid-fallbacks 双回退帧），README Visual QA 表补行。
  - **术语**：CONTEXT.md「图卡（Diagram Card）」入册（intake-grilling.md 草案 + 实施细节：sticky 钮组、panZoom、懒加载主包零增量、浅色主题范围外）。
  - **gate 终态**：typecheck 绿；lint 0 error（EmptyState 既有 warning 非本票）；vitest 1131/1131；electron smoke ALL GREEN；visual:mermaid 全探针 + 3 帧实跑通过；code-review 双轴完成（Standards：英文文案/测试原则/Seam-1 守卫全过，抓出 fullscreen 头部 Duplicated Code 一处 → 3bbad96 收敛为单 header surface 工厂 + aria-expanded 按面报告；Spec：七验收项逐条对上，零 scope creep）。
  - **ps 自查**：每次应用通道前执行；visual 复跑时捕获到 wt-58 worktree 曾有存活 Electron（无干扰，隔离 store）——后续通道零并跑。
  - **package-lock**：mermaid 12.0.0 依赖树入 lock——合并时 T00 按既定分级处置。
  - **交接给合并会话**：完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 59`。票 60（强串行于本票，同文件 Markdown 块投影与卡组件）现可开工。
- 2026-09-11 (operator decisions, post-review @ 15046f7): 操作者对 mm1/mm3 帧两项复核拍板：
  - **① mm1 箭头不直 → A 维持现状（零改动）**：对照实验实锤根因——同一份 mermaid 12.0.0 离线渲染，种子源码里 Start↔Gate 存在双向边（A→B 与 B -->|no| A），dagre 对反向边各自横移端口、折线绕行（路径数据：双向边 `M75.5,57…Q…L72.3,107.5…` vs 单向边 `M97.5,57L97.5,93` 纯直段）；我们管线对几何零干预（SVG 原样注入），ZCode 同库同型同形状。帧如实反映库行为。
  - **② mm3 sticky 头行悬停叠图 → 修复**：ZCode 取证的 sticky 钮组形态在卡片被转录卷走时头行钉住、叠在自家图内容上，操作者判为缺陷——去掉 `.md-diagram-head` 的 sticky（头行随卡滚走，与其它块头一致）。**操作者批准的 ZCode 偏离**已记入 CONTEXT.md「图卡」词条。全门复跑绿（typecheck / lint / vitest 1131 / visual:mermaid 全探针，mm1/mm2/mm3 三帧重生成）。
