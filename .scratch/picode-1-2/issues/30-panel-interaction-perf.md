# 30: 交互性能——拖拽直写 DOM + markdown memo + dock 同模式

**What to build:** 右侧面板拖宽与底部 dock 拖高期间**零 React 重渲染**：pointermove 期间 rAF 合帧**直写 DOM 尺寸**、pointerup 才 commit 状态；markdown 渲染组件 **memo 化**（props 不变不重解析）。滚动卡顿**先实测取证再收工**：Performance 面板录大 markdown 文件滚动的前后 flamegraph 归档，若拖拽修复后滚动仍卡，本票内继续追根因（DOM 重量 / CSS 效应）。

**背景（取证）：** 根因实证——`moveResize` 每个 pointermove dispatch `set-width` → App 级重渲染 → Markdown 组件未 memo 整文件重走 remark + rehype-highlight。底部 dock 拖高同反模式。本票是票 36（轨迹默认全展开）的性能前置。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 侧面板拖宽：拖拽路径零 React 重渲染（rAF 直写 DOM，pointerup commit）
- [ ] 底部 dock 拖高同模式
- [ ] markdown 渲染组件 memo 化
- [ ] 滚动卡顿：大文件前后 flamegraph 归档 + 数字记录在票内（守门）；另有根因本票内继续追
- [ ] 拖拽手感人工验收（大 markdown 顺滑）；typecheck / lint / test 全绿；visual 全帧重拍无回归

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q3 定稿（实测守门口径，操作者接受）。归类：性能缺陷（已交付能力不达标）。波次：W1（SidePanel/Markdown/BottomDock 唯一写者）。
