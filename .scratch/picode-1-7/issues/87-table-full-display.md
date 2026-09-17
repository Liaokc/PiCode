# 87: 表格完整展示——去高度压缩 + 删 preview 浮层

**What to build:** 转录中 markdown 表格**完整展示**：①去掉表体 360px 高度压缩——表体自然高度随转录流渲染（转录自身滚动），宽表保留横向滚动；②**删除 md-table-preview 浮层与 eye/expand 钮**（完整展示后成死 UI；「表格 fullscreen 维持不做」豁免同步维持）；③工具栏只剩 复制 / CSV / TSV。

**背景（取证）：** `.md-table-scroll { max-height: 360px }`（`app.css:5104` 区段）+ `md-table-preview` 浮层（Markdown.tsx 表格段，"View the table in a larger, scrollable view"）；ZCode 参照帧 `z-table-hover`：表体完整展示、宽表横向滚。操作者拍板（Q2）：去 cap + 删浮层 + 工具栏三钮。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] 长表格自然高度完整展示（无内部纵向滚动），转录流滚动阅读（electron smoke + visual 帧）
- [ ] 宽表横向滚动保留（列不挤压）
- [ ] preview 浮层 / eye 钮 / expand 钮删除；工具栏 = copy / CSV / TSV（功能不回归）
- [ ] DiagramCard（图卡）等 markdown 其他围栏渲染零回归；深色主题纪律不变（mermaid 浅色先例）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
