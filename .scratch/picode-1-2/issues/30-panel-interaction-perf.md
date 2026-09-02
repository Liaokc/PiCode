# 30: 交互性能——拖拽直写 DOM + markdown memo + dock 同模式

**What to build:** 右侧面板拖宽与底部 dock 拖高期间**零 React 重渲染**：pointermove 期间 rAF 合帧**直写 DOM 尺寸**、pointerup 才 commit 状态；markdown 渲染组件 **memo 化**（props 不变不重解析）。滚动卡顿**先实测取证再收工**：Performance 面板录大 markdown 文件滚动的前后 flamegraph 归档，若拖拽修复后滚动仍卡，本票内继续追根因（DOM 重量 / CSS 效应）。

**背景（取证）：** 根因实证——`moveResize` 每个 pointermove dispatch `set-width` → App 级重渲染 → Markdown 组件未 memo 整文件重走 remark + rehype-highlight。底部 dock 拖高同反模式。本票是票 36（轨迹默认全展开）的性能前置。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 侧面板拖宽：拖拽路径零 React 重渲染（rAF 直写 DOM，pointerup commit）
- [x] 底部 dock 拖高同模式
- [x] markdown 渲染组件 memo 化
- [x] 滚动卡顿：大文件前后 flamegraph 归档 + 数字记录在票内（守门）；另有根因本票内继续追 — 实测结论：纯滚动（转录 + 预览两表面）前后都丝滑，卡的是拖拽 dispatch 风暴，已修；详见 Comments 数字表
- [x] 拖拽手感人工验收（大 markdown 顺滑）；typecheck / lint / test 全绿；visual 全帧重拍无回归 — 自动化门全过（签名探针 21 帧重拍通过），手感留操作者复验

## Comments

- 2026-09-02 (merge session): 操作者明示已验收（含拖拽手感人工复验）→ merged as **70cf5f5** (merge --no-ff onto main @ 0909377)。rebase 冲突一处：票文件状态对撞（feat 中间态 claimed vs main 终态 ready-for-human）——例行取 main 侧，分支 tracker 终态提交 79a0845 随之去重丢弃；BottomDock / dock-model 两热点均 git 自动合并成功，零语义级对撞。main 终态审计：typecheck 绿，vitest **673/673**（61 files，+4 为 dock-model / panel-model 新用例），接缝幸存——Markdown memo(MarkdownImpl)、SidePanel/BottomDock rAF 直写 + pointerup 单次 commit、perf 工具链（scripts/perf/flame.mjs / src/main/visual-perf.ts / PICODE_PERF 门控）全在位、27 的 ⌥⌘J 注释与 30 的拖拽实现同文件共存、无冲突标记残留。flame 证据档案随 feat 入库（票特有新证据）。另：本票文件分支终态有一处重复的「## Comments + intake」段（实现会话簿记手误，随 sync 原样带入），本次 tracker 收尾一并去重。
- 2026-09-02 (requirements intake): 建票。grilling Q3 定稿（实测守门口径，操作者接受）。归类：性能缺陷（已交付能力不达标）。波次：W1（SidePanel/Markdown/BottomDock 唯一写者）。
- 2026-09-02 (实测取证，CDP Profiler 500µs，80 节 ×~1.8KB ≈150KB markdown、80 代码卡 + 80 表格；wheel 200×120px / drag 90×8px / dock 80×6px；档案 `flame/*.cpuprofile + *.summary.json` 本票目录):

  | 场景 | 指标 | before | after |
  |---|---|---|---|
  | drag-panel | 帧交付 | 201/677 (30%) | 200/203 (98.5%) |
  | drag-panel | 长任务 | 90 个共 9536ms（max 144ms） | **0** |
  | drag-panel | 脚本自耗时 | markdown 393ms + react 226ms | markdown **0** + react 1ms |
  | drag-dock | 帧交付 | 180/561 (32%) | 179/179 (100%) |
  | drag-dock | 长任务 | 80 个共 8795ms（max 155ms） | **0** |
  | drag-dock | 脚本自耗时 | markdown 301ms + react 176ms | markdown **0** + react 1ms |
  | scroll（转录） | 帧交付 / 长任务 | 421/422 / 0 | 420/420 / 0 |
  | scroll-preview（打开的大 md 文件） | 帧交付 / 长任务 | 422/424 / 0 | 421/422 / 0 |

  - **拖拽根因量化坐实**：before 顶部热点全是 micromark/highlight（visit2 408ms、exec 362ms、factory 271ms）+ GC 349ms；after 归零。修复 = pointermove 零 dispatch、rAF 合帧直写、pointerup 单次 commit。
  - **滚动守门结论**：纯滚动（转录与预览两个表面、修前修后四组）全部 ~100% 帧交付、零长任务、markdown 解析 0ms——滚动本身不卡，操作者感知的"滚动卡"即拖拽风暴波及（拖拽时整 App 主线程饱和，滚动自然被饿死），拖拽修复即消除；无 DOM 重量/CSS 效应遗留根因需另追。预览侧另有 ticket-07 大文件策略兜底（>256KB md 转 source 窗口化，滚动零 React 路径）。
  - 工具链沉淀：`npm run perf:flame`（PICODE_PERF=1 非压缩构建 + `src/main/visual-perf.ts` 种子 + `scripts/perf/flame.mjs` CDP 驱动），四场景可复跑。
- 2026-09-02 (implementation): 落地于分支 t30-panel-perf，修复本体 sha `6c14409`（perf 工具链 `2f40137`、visual 重拍 `9087025`）。双轴 code-review 通过（Standards：SidePanel/BottomDock 拖拽同构约 30 行——票面明定"同模式"，等票 29 第三处拖拽出现时再抽 `useDragResize`；Spec：五项验收全落地、memo 严格限 Markdown 组件、无范围蔓延）。typecheck / lint / vitest 661 全绿；visual 21 帧签名探针全过。**待操作者**：拖拽手感人工复验（大 markdown 顺滑）+ 合并 `bash scripts/merge-ticket.sh 30`（本会话不自行 merge）。
