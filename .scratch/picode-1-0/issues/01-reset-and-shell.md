# 01: 净场与脚手架——窗口骨架

**What to build:** 以一次 reset 提交固化工作区清理（只留文档/ADR/参考件），随后 Electron 壳立起来：hiddenInset 红绿灯嵌侧栏、居中窗口标题、三区布局（左导航轨+任务列表骨架 / 主区空态 / 右侧面板收起）、空态问候+居中 Composer 静态版。`npm run dev` 一键起窗。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] reset 提交落盘：移除旧实现残留，仓库处于"全新起点 + 文档资产"状态
- [ ] `npm run dev` 启动无报错窗口，typecheck/lint/test 脚本可用且绿
- [ ] 标题栏形态对照基准截图（红绿灯位置、标题居中）通过
- [ ] 三区布局静态呈现，空态结构与截图 02/03 的构图一致（问候语、Composer 卡片、快捷芯片槽位）
