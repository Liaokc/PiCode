# 06: 面板容器 + Review 标签

**What to build:** 右侧 Side Panel 框架：开合、多 tab、宽度拖拽；首个标签 Review——工作区 vs git HEAD 的全量差异视图：per-file diffstat、文件树、unified 默认、split 切换。只读呈现（不含提交/推送按钮）。空态对照截图 03 的"打开标签页"卡片构图（本产品仅 Review/Terminal 两卡）。

**Blocked by:** 02 Host 活体。

**Status:** ready-for-agent

- [ ] 面板开合/多 tab/拖宽手感自然，主区自适应不跳动
- [ ] Review 差异内容与终端 `git diff` 输出语义一致；unified/split 即时切换
- [ ] 千行级大 diff 滚动保持流畅
- [ ] 空态两卡（Review/Terminal）构图对照截图 03 通过
