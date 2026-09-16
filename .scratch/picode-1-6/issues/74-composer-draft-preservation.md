# 74: Composer 草稿保留——per-session 槽 + New Task 单槽

**What to build:** composer 已打未发的内容（**文本 + 已贴图片**）在视图切换后保留：**per-session 草稿槽**（会话视图注册表扩展——修复多活动会话切换丢草稿的对侧）+ **New Task 单槽**（App 层级）；切走切回恢复对应槽；发送后自然清空；空草稿不占槽；**内存级**——重启即失（操作者拍板不需跨重启）。与 73 修好的切换行为联合验收（切走必达 + 切回草稿在）。

**背景（取证）：** composer 值为组件局部状态；ADR-0006 后台不渲染 + 切回重挂载——会话切换即丢；New Task 卸载同丢。Q7 被操作者否决（「草稿需要保留」）后 Q11 定界：文本+图片、内存级、一并做 per-session 槽。决议记录见 `../intake-grilling.md` R13 节。

**Blocked by:** 73（切换行为是其验收前提；同文件群 App/注册表串行）.

**Status:** ready-for-human

- [x] Seam-1 草稿槽纯模型（set/clear/restore；per-session 槽 + New Task 单槽；空槽不存）——`shared/composer/drafts.ts`（记录 + 空槽不存 + park 规则，13 测试）+ 注册表 `RegistrySession.draft` 槽与 `set_session_draft` 动作（寻址式、空草稿清槽、再公告保留 draft、detach 随条目丢弃；registry 测试 +9）
- [x] electron smoke：New Task 打字 → 切会话 → 回 New Task 草稿在；会话 A/B 各自草稿独立互不串；带图草稿（贴图 → 切走 → 切回 → 缩略图与附件在）——smoke stage 74 全过：`draft_preserve_rows/resumes/independent/image_paste/image_roundtrip/newtask_roundtrip/escape` 全 ok；直切 A→B 同时锁死同实例 composer 泄漏（修复：ChatView 按 focusedId 加 key，ADR-0006 切回重挂载字面化）
- [x] 发送后草稿自然清空；重启不保留——会话内 prompt 与 New Task 发送两条路径都清槽（`draft_preserve_send_clear_ok` / `draft_preserve_newtask_send_clear_ok`）；renderer reload（重启代理，票 39 先例）后启动空态与重新 resume 的 A 均 resting（`draft_preserve_restart_empty_ok`）
- [x] 术语 rider：「草稿（Composer Draft）」入 CONTEXT.md（界面语言节，输入展开之后）
- [x] 纯 renderer 状态扩展，零契约增量；全英文文案——contract.ts 零改动；smoke stage 全英文
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）——每次 smoke 前 ps 检查；期间发现 wt-69 的 smoke 并行运行一次，等待其退出后才继续

**实现要点（审查入口）：**
- 草稿桥：Composer 以 owner 标签（session id / new-task）经 `draftBridgeRef`（useLayoutEffect，渲染后发布——父属 ref 不在 render 期写）发布实时草稿；App 在**每次视图切换前** park 到对应槽（owner 路由；空草稿清槽；stale-idempotent）。park 点：行点击/⌘K、⌘N、Escape（关 New Task 与关设置）、通知聚焦、设置开合（`dispatchShellParking` 包裹 TitleBar 齿轮/侧栏钮）、`session_created` 公告（fork/resume/rebuild 的自动切换）。
- 发送清槽：`handleComposerSend`/`handleSteer`/`handleFollowUp` 显式清聚焦会话槽；`startTask` 清 New Task 槽（⌘N 复活防线）。
- 恢复：Composer 挂载时 state 初始化器读槽恰好一次（`initialDraft`）；附件卡重建（新 id + data:URL 预览）；caret 在文末。
- 泄漏修复：直切会话 A→B 原本同一 Composer 实例留存（文本跨会话串）——ChatView 按 `focusedId` 加 key 使每次切换重挂载、从各自槽恢复。

**验证记录：** typecheck ✓；eslint（仅存 packages-service 预存在错误，stash 对照确认非本票引入）✓；vitest 89 文件/1346 测试 ✓；electron smoke ALL GREEN（185 ok 步、零 FAIL、20 host 无孤儿）✓。smoke 中另落三处测试厂健壮性修复（smoke.ts）：探针片段括号化（`x ?? 'missing' === ''` 实为 `x ?? false`，空值断言反转）、计数提示词加 no-tools（GLM 思考期 3 次选择 bash seq 卡死审批门零 delta）、nav_rail 首发等待器先行（同二次发送的 warm-host 竞态，本次再现）。

**验收截图：** `captures/`（README 见同目录；`scripts/smoke/draft-captures.mjs` 采集，CDP 驱动 built app、零模型调用、每张截图前置 DOM 断言）——1/2 New Task 单槽切走切回、3/4/5 会话 A/B 草稿独立 + 带图草稿恢复。
