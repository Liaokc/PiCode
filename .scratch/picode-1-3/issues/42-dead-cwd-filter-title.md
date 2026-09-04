# 42: 死 cwd 会话过滤 + 标题推导修正

**What to build:** 会话索引扫描加 **cwd 存活性**维度：工作目录在磁盘上已不存在的会话不进索引——侧栏两视图与 ⌘K 均不可达（这些会话在当前语义下本就无法打开；与「隐藏永不使会话不可达」不变式不冲突：不变式守护本地偏好隐藏，非物理失效）；in-app 活 host 会话不受过滤影响；会话文件零改动。顺手修**标题推导**：`firstUserText` 跳过行首 `<skill>` 标签原文、取后续有效文本，缺失回退技能名——worktree 会话标题不再显示 `<skill name="implement" locat...`。

**背景（取证）：** sessions 库存有 27 个 `.worktrees-wt-*` cwd 组（1.1/1.2 实现会话遗留），worktree 合并后目录已删；点击 → resume(cwd=已删路径) → SDK 抛错 → host exit(1) 崩溃横幅（截图 pi13-worktree-session-groups / pi13-dead-cwd-host-exit）；扫描管线无 cwd 存在性检查；标题与树节点预览同在 parse 一文件。

**Blocked by:** None (can start immediately)。

**Status:** ready-for-agent

- [ ] cwd 不存在的会话不进侧栏两视图、不进 ⌘K；侧栏不再出现死组
- [ ] in-app 活会话（cwd 中途被删）仍列出、可聚焦，不受过滤影响
- [ ] 会话文件零改动；被滤会话无任何删除/迁移动作
- [ ] 标题跳过 `<skill>` 标签：取后续文本，缺失回退技能名；既有标题行为不回归
- [ ] cwd 存活过滤（stat 注入）与标题推导纯函数表驱动（Seam-1）
- [ ] electron smoke（隔离 userData 种死 cwd 会话 → 不可见；活会话存活）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R4，grilling Q4 方案 a + 标题修正）。过滤谓词先例 filterArchived（注入式纯函数）；43 因 parse 同文件被本票阻塞。波次：W1。
