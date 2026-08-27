# 07: 文件预览标签

**What to build:** Side Panel 的 File Preview 标签：markdown 渲染与代码语法高亮、面包屑路径导航；消息流中的文件改动卡片与 Review 条目可 deep-link 直达对应文件预览（对照截图 04/08 右栏形态）。

**Blocked by:** 06 面板容器 + Review 标签。

**Status:** ready-for-agent

- [ ] md 与源码文件的预览呈现对照截图 08 通过（标题层级、行内代码、表格、高亮主题）
- [ ] 从文件改动卡与 Review 文件树一键直达预览，面包屑可逐级回退
- [ ] 大文件打开不卡 UI（超长文件策略明确）
