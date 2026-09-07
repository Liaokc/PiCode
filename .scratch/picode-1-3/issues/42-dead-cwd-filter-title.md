# 42: 死 cwd 会话过滤 + 标题推导修正

**What to build:** 会话索引扫描加 **cwd 存活性**维度：工作目录在磁盘上已不存在的会话不进索引——侧栏两视图与 ⌘K 均不可达（这些会话在当前语义下本就无法打开；与「隐藏永不使会话不可达」不变式不冲突：不变式守护本地偏好隐藏，非物理失效）；in-app 活 host 会话不受过滤影响；会话文件零改动。顺手修**标题推导**：`firstUserText` 跳过行首 `<skill>` 标签原文、取后续有效文本，缺失回退技能名——worktree 会话标题不再显示 `<skill name="implement" locat...`。

**背景（取证）：** sessions 库存有 27 个 `.worktrees-wt-*` cwd 组（1.1/1.2 实现会话遗留），worktree 合并后目录已删；点击 → resume(cwd=已删路径) → SDK 抛错 → host exit(1) 崩溃横幅（截图 pi13-worktree-session-groups / pi13-dead-cwd-host-exit）；扫描管线无 cwd 存在性检查；标题与树节点预览同在 parse 一文件。

**Blocked by:** None (can start immediately)。

**Status:** resolved

- [ ] cwd 不存在的会话不进侧栏两视图、不进 ⌘K；侧栏不再出现死组
- [ ] in-app 活会话（cwd 中途被删）仍列出、可聚焦，不受过滤影响
- [ ] 会话文件零改动；被滤会话无任何删除/迁移动作
- [ ] 标题跳过 `<skill>` 标签：取后续文本，缺失回退技能名；既有标题行为不回归
- [ ] cwd 存活过滤（stat 注入）与标题推导纯函数表驱动（Seam-1）
- [ ] electron smoke（隔离 userData 种死 cwd 会话 → 不可见；活会话存活）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R4，grilling Q4 方案 a + 标题修正）。过滤谓词先例 filterArchived（注入式纯函数）；43 因 parse 同文件被本票阻塞。波次：W1。
- 2026-09-04 (implement, t42-dead-cwd-filter @ 774caa9): 完成。① 索引加 cwd 存活性维度：纯谓词 `filterDeadCwd`（src/shared/sessions/cwd-liveness.ts，stat 注入、Seam-1 表驱动 8 行）；index-service 每轮扫描对去重后的 cwd 各 stat 一次（目录才算活），liveness+豁免并入 index-changed 签名——目录消失/复现即使零文件变化也触发侧栏刷新；侧栏两视图与 ⌘K 由同一索引自动不可达（零 renderer 改动）。② 活 host 豁免：supervisor 新增 `liveSessionIds()`（announced 绑定集合），main 接线注入；electron smoke 实证 resume 后删 cwd，行存活（dead_cwd_live_exempt_ok）。③ 标题：`sessionTitleFromUserText` 逐字镜像 SDK parseSkillBlock 正则（agent-session.js），取 `</skill>` 后文本、缺失回退技能名，经 summarizeSession 表驱动 7 用例；既有 24 标题用例零回归。④ 会话文件零改动（smoke 断言字节仍在）；目录复现即恢复列出（单测）。⑤ 6 个 visual harness + 基座 harness 原种假 cwd（/Users/dev/projects/*）全部改种真 tmpdir（ensureVisualProjectDir，basename 保持探针不变）——过滤器要求 fixture 真实。⑥ electron smoke 新增 dead_cwd 阶段 8 探针全绿（隔离 PICODE_SESSION_DIR + 一次性 userData，只读种子）；smoke:electron 全程通过（含既有全部阶段）；typecheck/lint/vitest 964/964 绿。code-review 双轴：Standards 3（1 已修 774caa9，2 记录性 judgement call）、Spec 0 缺失 0 超范围。**待操作者合并：`bash scripts/merge-ticket.sh 42`**（不自行 merge）。
- 2026-09-04 (merge): merged as **e9b1a44**（--no-ff，18 文件 +584/−51，实现提交重放为 5b6f18c，review 提交干净重放）。验收口径：操作者目检后明说「已验收」。冲突处置：① 票文件状态对撞 ×1——42 会话把 claimed 翻转混进了实现提交 56fcf2c（应独立成 tracker 提交），与 main 侧簿记 sync 相撞，例行取 main 侧，翻转在重放中被剥离，实现提交变为纯代码提交；② 分支 tracker 提交 7863e88 判重丢弃；③ 无代码冲突（42 会话已自行 rebase 到 abe477d，零代差）。main 终态审计：typecheck + vitest **964/964**（72 文件，+19）；filterDeadCwd 接线 index-service / sessionTitleFromUserText 收私有（review 承诺）在位；38/39/40 三票接缝（纯函数三套、app.css 三段、data-closed、CONTEXT 词条）完好；无冲突标记。解锁：**43**（History 树重塑，parse.ts 写者接力）。
