# 12: 终局像素 QA + 发布准备

**What to build:** 视觉红线终审：对照 `.scratch/reference/screenshots/` 九张基准逐屏比对修正视觉漂移（间距、圆角、字重、色值、动效手感），形成记录归档；完整兼容冒烟套件跑绿（host 契约、真 SDK 流式、PTY、Usage 聚合、TUI↔SDK 会话互通）；本地打包脚本交付。

**Blocked by:** 07 文件预览标签、08 终端 PTY + 桥接、11 设置面板 + 全局打磨。

**Status:** ready-for-agent

- [ ] 九张截图逐屏比对记录归档，偏差修复或经所有者明确豁免
- [ ] 冒烟套件单命令跑绿并纳入仓库脚本
- [ ] 打包产物本机可启动运行一轮真实会话
- [ ] README/AGENTS 文档收尾，工单全量勾选
