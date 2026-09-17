# 84: 侧栏拖拽重排——组内会话序 + 组间序 + Manual 排序

**What to build:** 侧栏拖拽重排端到端：①**项目组内拖拽会话排序**；②**项目组之间拖拽排序**（组顺序）。筛选下拉 Sort by 增第三项 **Manual**——首次拖拽自动切入（下拉可见勾选）；手动顺序（组内行序 + 组序）持久化于本地偏好（重启保留、**会话文件零改动**）；切回 Updated/Created = 自动排序生效（手动顺序保留不生效，再拖回 Manual）。组行 ⋮⋮ 图标转正为**真拖拽句柄**（Projects 分区行的 grip 删除——无分区重排语义）；会话行 = 行本体拖拽（句柄形态票内裁量）；灰行（cwd missing）照常可拖；拖拽动画/放置指示对齐 ZCode 构图。**Timeline 视图与置顶区不参与拖拽；跨项目移动会话不做**（会话项目身份 = 文件头 cwd——改它 = 写 Pi 会话文件 = 红线）。

**背景（取证）：** grips 现为无 handler 静态图标（`Sidebar.tsx:715` 分区行 / `:784` 组行，hover 让位 `app.css:838`）；组序与组内行序现全由排序键派生（`group.ts:88-90`——Updated/Created 切换合法翻转组序）；偏好持久化走 `settings.preferences`（hiddenGroups/readStates 同库）；ZCode 校准 = `workspaceSidebar.reorderSection`「移动分区」+ 任务拖拽 drop zone（bundle 键表）。ZCode 空组 drop zone 不做（PiCode 无空组形态）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] Seam-1 表驱动：分组纯模型增手动顺序（组内 map + 组序数组）——拖拽置位/跨组序调整/Manual 切换/Updated-Created 切回（手动保留不生效）全表
- [x] 拖拽只改本地偏好，会话文件零改动（断言：重排前后 sessions 目录字节不变）
- [x] Timeline / 置顶区无拖拽；灰行组内可拖；重启后手动顺序保留（本地偏好持久化）
- [x] electron smoke：拖拽会话行（组内换位）+ 拖拽组行（组间换位）+ 下拉 Manual 勾选态
- [x] 组行 grip 成为拖拽句柄、Projects 分区行 grip 删除；筛选下拉新增 Manual 项
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（"Manual" / "Collapse all" 族词汇表见 spec）

## Comments

- 2026-09-17 (implement session)：端到端落地，rebase 到 main（t85/86 已并入，无冲突）后全量验证。
  - **Seam-1 纯模型**（新 `src/shared/sessions/reorder.ts` + `group.ts` 扩展，vitest 表驱动 31 例 = `tests/shared/sessions-reorder.test.ts`）：
    - `ManualSidebarOrder` = `{ sessions: Record<cwd, 会话id[]>, groups: cwd[] }`，新增偏好 `sidebarManualOrder`（normalize/merge 防御：字符串去重去空，junk 降级空序）。
    - **未知回退 = 尾部追加（Updated 序）**：存序只管辖用户排过的；新会话/新组按 Updated 序接尾——空手动序渲染**恒等于 Updated**（下拉先点 Manual = 零跳动），且"锚点为未见过的行"的拖拽可解（drop 前尾部 reconcile 物化）。
    - **关系锚点语义**：move 永远是「X 置于 Y 之前（null = 末尾）」而非数字下标——切回 Manual 后同一相对关系在手动视图中成立；no-op 拖拽返回同引用（零偏好空写）；输入不可变。
    - Manual 渲染路径：`groupSessions/timelineSessions` 增 manual 分支（置顶区恒 Updated 序——置顶不拖；Timeline = 手动组序平铺，不参与拖拽只镜像 Projects 排布）。
  - **Sidebar UI**：会话行本体 drag（Projects 视图组内，灰行同路径同句柄；置顶/Timeline 行不传 handler，渲染 `draggable="false"`）；组行 ⋮⋮ grip 转正真句柄（包一层 draggable span，ghost = 整个组头行），Projects 分区行 grip 删除；drop 指示 = 目标边内缘 2px accent-indigo 线（box-shadow 内描，零布局位移）；分区级 drop zone 上半=置前/下半=置后；drop 目标从事件几何现算（dragover 只养指示器状态——同一 task 内连发 dragover+drop 的测试驱动也精确落位）；跨组会话拖拽在 dragover 闸门拒收（浏览器 not-allowed 光标，drop 永不落地）。
  - **偏好与切换**：drop 一次 patch 写 `{sidebarManualOrder, sidebarSort:'manual'}`（App 层 `onCommitManualOrder`）——首拖自动切入 Manual（快照当下渲染 + 落位，零跳动）；下拉第三项 Manual（⋮⋮ 图标）可勾选/切回；切回 Updated/Created 自动排序生效、手动序保留不生效，再拖即复合到存序重新进入。重启保留走既有偏好持久化链（与 sidebarWidth 同库同 boot-seed 路径）。
  - **electron smoke**（`smoke.ts` ticket-84 stage，10 个 `sidebar_drag_*` 断言全绿）：三项目组种子（B/A/C 相对序）→ 组内行拖（a2→a1 上方）→ 下拉五项 + `By project,Manual` 勾选态 → grip 组拖（A 移到 B 之上）→ **灰行拖拽**（删 C 项目目录等 cwd missing 后拖 c2→c1 上方）→ **红线断言**（全 store 逐文件 sha256 指纹拖拽前后 byte-identical）→ 偏好文档主进程侧直读（sort=manual + groups 相对序 + sessions[A]=[a2,a1]）→ `webContents.reload()` 重启代理（组序 + 行序 + Manual 勾选全保留）→ Timeline 零 draggable 行 → 右键菜单钉 b1 验置顶行非 draggable（后 unpin 复原）→ **收尾恢复 Updated 排序**（后续 stage 的种子会话落 Updated 顶部，不被 Manual 尾部追加吞进 Show-more 之后）。真实模型调用 stage（02/44/25/28…）同跑全绿。
  - **visual harness**（新 `npm run visual:drag`，`PICODE_VISUAL_DRAG=1` 独立运行——刻意不搭 PICODE_VISUAL=1：基础帧 harness 的 2d fork 帧钉精确侧栏行数，共租必挂）：种子两组×两会话 → 行拖 + 组拖 → 断言相对序 → 三帧 `.scratch/visual/d1-row-dragged.png`（组内换位 + Manual 生效态）、`d2-dropdown-manual.png`（下拉 Manual 勾选）、`d3-group-dragged.png`（组间换位）。
  - **vitest 1517/1517 + typecheck 双 tsconfig 清**（rebase 后重跑）；electron smoke rebase 后全跑 EXIT=0（`ps` 自查无其他 dev-app/smoke 进程；首跑遇 ticket-25 deny-reason / ticket-28 selection 两处模型时序 flake，与审批/选择域代码零相关——t85/86 零触碰该域，复跑即绿，我的 stage 十断言每次全绿）。
  - UI 文案全英文（"Manual"）；CONTEXT.md 筛选下拉条目更新（三选一）+ 新增**手动排序（Manual Sort）**词条。零契约增量（纯 renderer + 偏好 additive 字段）。
  - **操作者：`bash scripts/merge-ticket.sh 84`。**
