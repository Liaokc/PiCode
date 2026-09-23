# 145: README 国际化与品牌升级——logo/横幅/badge/截图 + 中文版

**Status:** In Progress

**What to build:** 操作者指令：像高 star GitHub 项目一样升级 README——中文版、logo、图片等。研究员正在调研高星范式（产出 `.scratch/readme-research-brief.md`）。

**交付物：**
1. README.md（英文主版）：居中 logo + 项目名 + tagline、badge 行（version/platform/license 等）、语言切换行（English | 简体中文）、hero 截图、特性亮点区、截图网格、快速开始；保留既有 Development / Compatibility smoke suite / Visual QA / Packaging 段落锚点（AGENTS.md 引用它们）
2. README.zh-CN.md：完整中文镜像，顶部互链
3. docs/assets/：logo（源 = build/icon.png）、精选截图（从已提交的 .scratch/visual/ 帧复制 hero + 特性图，README 不直接引用 .scratch 路径）
4. 待操作者决策：LICENSE 文件（仓库当前无 LICENSE 无 license 字段——badge 与法律状态需要它；建议 MIT，待确认）

**Acceptance:**
- [ ] 中英双版本互链、结构对齐、内容同步
- [ ] 既有段落（Development/smoke/Visual QA/Packaging）与锚点保留，AGENTS.md 交叉引用不破
- [ ] 图片全部走相对路径且已提交（docs/assets/）
- [ ] badge 数据真实（version 1.8.0、平台 macOS、license 以操作者决策为准）
- [ ] main 提交 + 推送 + LIA-155 镜像

**Red lines:** 零产品代码改动；.scratch/visual/ 原帧不动（只复制）。

**Blocked by:** 无（license 决策可后补）.
