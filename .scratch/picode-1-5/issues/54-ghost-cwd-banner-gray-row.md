# 54: 幽灵 cwd 供面——预警横幅 + 灰行 + cwdMissing 契约增量

**What to build:** 活会话的工作目录在磁盘上被删时，受感染会话的会话视图顶部出现**常驻预警横幅**：纯说明文字（运行可继续 / 文件工具会失败 / 退出后无法重开），无关闭钮，目录恢复即自动消失——存活性的派生投影，只影响该会话视图（Q1/Q2 拍板 A）。重启后，死 cwd 会话在侧栏显示为**灰行 + "cwd missing" 说明**（替代票 42 的"完全不可见"副作用）：点击弹解释 toast、零 resume 尝试；右键菜单保留无害项（Archive / Copy task path / Copy session file path / Copy session ID），打开类动作不出现；⌘K 维持排除（Q3 拍板 A）；目录复现自动恢复普通行。会话文件零改动。

**背景（取证）：** 票 42 基建在位——索引服务每轮 2s 扫描已对全部去重 cwd stat 且 liveness 参与变更签名（目录消失/复现即使零文件变化也触发刷新）；缺口 = 活会话 cwd 死亡无任何供面 + 死 cwd 会话从侧栏/⌘K 完全不可见。resume 已删 cwd 仍必 host exit(1)（pi13-dead-cwd-host-exit）——灰行是纯展示态，resume 路径零触碰。上批讨论的 B 选项转正。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 会话摘要投影增 cwdMissing 标志（additive 契约增量，实施时报备入 host-contract smoke；旧载荷缺字段照常通过）；死亡/活豁免/复现恢复三态表驱动（cwd-liveness 套件扩展）
- [x] 预警横幅：受感染会话视图顶部常驻；三条事实文案（全英文）；无关闭钮；cwd 存活性翻转即自动显隐；仅该会话视图显示，不动状态点词汇
- [x] 灰行：侧栏置灰 + "cwd missing" meta 说明；点击仅弹解释 toast（英文），零 resume 调用；右键菜单仅无害项；⌘K 面板维持排除
- [x] 目录复现：横幅与灰行自动恢复（electron smoke 断言）
- [x] electron smoke：删 cwd → 横幅显；重启场景 → 灰行；恢复 → 消失
- [x] visual harness：灰行帧
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 54`（merge-ticket.sh:50 已含 picode-1-5）。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R1，Q1/Q2/Q3 均 A）。本批唯一触 main/contract 的票（cwdMissing additive）。波次 W1。ChatView 与 55/56 邻接（横幅插点 vs 回合渲染条件 vs 分割模型——区域不同，rebase onto main 纪律即可，无硬阻塞）。术语「预警横幅（CWD Banner）」「灰行（Dimmed Row）」随票入 CONTEXT.md。
- 2026-09-11 (implement, t54-ghost-cwd-supply @ 018ede3 + ca67ab3): 全验收项完成，合入前请 rebase onto main（55/56 同文件邻接）。**契约增量报备**：`SessionSummary` 增可选 `cwdMissing`（缺席 = 活，精确旧载荷形状；真仅对死 cwd 置位）——host-contract smoke 已入账并验证旧载荷兼容（"SMOKE cwdMissing contract ok — absent while alive, true when dead; old payloads (field missing) pass through unchanged"）。实现要点：票 42 的 index 级活豁免溶解为渲染层投影——索引不再过滤（`filterDeadCwd` → `withCwdMissing` 注记，list 时施加、缓存零改动），三态表 `cwdRowState`（normal / warning=活豁免出横幅 / dimmed=灰行）收于 cwd-liveness 套件；supervisor.liveSessionIds 及其测试随之退役（生产零调用）。横幅纯派生（focused × inApp × flag，无 dismiss 状态）；灰行点击 guard 置于 handleOpenSession 首位（覆盖侧栏/⌘K 全路径），灰行菜单 = `grayRowMenuGroups()` 恰四项；⌘K `excludeDimmedRows` 复用同一谓词。检测零新建（既有 2s cwd stat）。验证：typecheck / lint（0 error）/ vitest 1115 全绿；host-contract smoke PASS；electron smoke 全阶段 GREEN（dead_cwd_gray_row / click_toast 零 resume / gray_menu 四项 / palette_hidden / banner_shown 三事实无钮 / banner+row recovered）；visual:cwd 四帧（cwd1-dimmed-row / cwd2-gray-row-menu / cwd3-restored / cwd4-restored-menu）断言全过；ps 复核执行（遇 wt-55 在跑 smoke，等待重试未并跑）。**复查补充（操作者指出恢复证据未覆盖菜单）**：菜单与行同属渲染时纯派生（`dimmedFor` 一处开关），实现上恢复即回九项；已补 cwd4-restored-menu 帧 + smoke `cwd_menu_restored_ok` 断言封住这一环（两 harness 重跑 GREEN）。code-review 双轴（本会话顺序执行，无 sub-agent 工具）：Standards —— CONTEXT 词汇入册、全英文文案、Seam-1 纯函数表驱动、additive 契约纪律均符合；一处自查修正（excludeDimmedRows 收敛到 cwdRowState 单一事实源）+ 死代码清理（supervisor.liveSessionIds）；Spec —— 八验收项逐条落地，无范围外行为（自觉判定：死 cwd 项目在新任务 chip/分组 New Task 钮中重新可见属既有 host-exit 错误横幅处理路径，不在本票面内，未额外过滤）。**不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 54`。**
- 2026-09-11 (merge, T00 合并会话): **merged as 0cc3347**（merge --no-ff；分支两提交 rebase 后为 49a9378 + 2637711）。
  - **验收口径**：操作者 2026-09-11 于 wt-54 dev 目检后明示「54 工单已验收」；脚本门禁 typecheck 绿 + vitest **1122/1122（81 文件）**（55 合入后 1113 → 本票净增 +9：cwd-liveness 表驱动扩展、grayRowMenuGroups、context-menu/task-search 增量，扣除 supervisor.liveSessionIds 退役测试）。
  - **冲突处置**（rebase 018ede3 时两处，均属「相邻追加、双方保留」级；ca67ab3 干净重放）：
    - `package.json`：55 的 `visual:worked` 与 54 的 `visual:cwd` 脚本行同位相邻 → 两行共存（L39–40）；
    - `src/main/visual.ts`：55 的 worked harness 让位守卫与 54 的 `PICODE_VISUAL_CWD` 让位守卫同位 → 双守卫共存。
    - 其余预判对撞面全部自动合并：CONTEXT.md（54 两词条 + 55 词条）、smoke.ts（54 cwd 阶段 + 55 ticket-55 段）、ChatView.tsx（54 横幅 L238 + 55 hasContainer L272）、app.css、src/main/index.ts。无 mermaid 类 lockfile 冲突。
  - **终态审计**：CONTEXT.md「预警横幅（CWD Banner）」L89 +「灰行（Dimmed Row）」L93 入册；cwdMissing additive 契约（types.ts L34 可选缺席字段 + host-contract-smoke L627+ 断言：活时缺席、旧载荷透传）在位；灰行（Sidebar dimmed + grayRowMenuGroups）在位；cwd1–cwd4 四帧 + visual-cwd.ts harness 入库；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删（was 2637711）。54 无下游阻塞票；活跃 worktree 清零。
