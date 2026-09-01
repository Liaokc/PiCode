# 25: 后台会话审批 UX——挂起 + 角标 + 通知

**What to build:** 多活动会话（票 20）下，后台运行的会话撞上审批闸门时：审批药丸**留在该会话内挂起等待，绝不自动批准**；侧栏该会话亮**橙色待审批角标**；**系统通知**（点击跳转该会话——前台化并挂载视图）；切回后可正常批/拒，行为与前台一致。

**背景（取证）：** grilling R3-Q3 ① 定稿；审批闸门为票 05 交付的能力（per-execution 工具闸门 + remember 规则 + deny 路径）。

**Blocked by:** 20。

**Status:** ready-for-human

- [x] 后台会话触发审批：药丸滞留会话内、agent 挂起等待；侧栏橙角标出现
- [x] 系统通知弹出，点击跳转该会话
- [x] 切回后批/拒行为与前台一致（approve + remember 链路回归）
- [x] deny 路径在后台同样终止本轮并更新转录
- [x] electron smoke 扩展（后台审批场景断言）；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 20 拆出（grilling R3-Q3 ①：绝不自动批准 + 角标 + 通知）。
- 2026-09-01 (t25 实现，0c7546a + 775373a): 全部验收项落地。**药丸滞留** = 既有 registry 折叠的天然结果（后台会话事件持续收集、approval_required 落进该会话 chat 状态），smoke 断言药丸不泄漏进他屏 DOM 且 agent 挂起期间无 agent_end（绝不自动批准无任何代码路径）。**橙角标** = registry 新增纯投影 `awaitingApprovalSessionIds` + `sidebarDotState` 第四态 `awaiting-approval`（橙点优先于动画点——挂起非运行），固定槽位内渲染 `.sb-await-dot`（11 行表驱动 + 6 条新 vitest，共 620 全绿）。**系统通知** = 渲染层判定「非聚焦会话的 approval_required」→ 新 IPC `notifications:approval-request`（preload/env.d.ts，main 侧 parseApprovalNotice 类型闸门）→ `src/main/notifications.ts` 发 OS 通知，点击走 `focusSessionFromNotification`（前台化 restore/show/focus + `notifications:focus-session` 深链）→ App 经 `focus_session` 纯聚焦切换并清 follow/new-task/tree 态。**切回一致** = 同一枚药丸组件、同 sendFocused 链路；smoke 直接驱动药丸 UI 按钮：Approve & Remember → tool_end + agent_end，再发 bash 不再询问（remember 规则回归）；deny 经药丸 UI（Deny… → 理由输入 → Deny）→ 本轮终止 + 理由往返 + 转录出现 denied 药丸 + 目标文件确认未落盘。**增量修复**：host 补发契约中早已定义却从未发出的 `approval_resolved` ack（deny 理由得以进转录，票 05 契约语义落地；host-contract smoke 阶段 2 补 ack 断言）。smoke 阶段 6 新增 bg_approval 场景（挂起/角标/通知/跳转/remember/deny/零孤儿）；fail 时 dump 最近 40 条事件环。smoke 全套 ALL GREEN（6 阶段，93s）；typecheck / lint / vitest 620 全绿。CONTEXT.md 增补「状态点」术语（含橙点语义与优先级）。code-review 两轴：Standards 无硬违规（通知模块单实现接口为 smoke seam 所需、IPC 通道类型闸门对齐既有惯例）；Spec 五项验收全有实现、无 scope 蔓延（approval_resolved 属票 05 契约既有意图）。**Status: ready-for-human** — 请操作者 `bash scripts/merge-ticket.sh 25`。
- 2026-09-01 (验收截图补齐): 新增 `npm run visual:approval` 关卡（`src/main/visual-approval.ts`，独占窗口、隔离 store、合成事件零模型调用）：产出入库 `.scratch/visual/a1-bg-approval-badge.png`（后台闸门命中：api-server 行橙点 + 主区无药丸——药丸滞留会话内；运行瞬间桌面同步弹出真实 OS 通知）、`.scratch/visual/a2-bg-approval-pill.png`（点击行前台化：挂起药丸带 Approve / Approve & Remember / Deny… 与前台一致，composer 停止钮可见）、`.scratch/visual/a3-bg-deny-transcript.png`（回合展开审计：bash 已批准工具卡 + write denied 药丸带往返理由「No new files today.」，橙点已清）。人工验收直接对照这三张 + smoke 阶段 6 的 bg_approval 断言链。
- 2026-09-01 (操作者视觉反馈轮 1): 挂起药丸宽度不对齐——上方回合分割线全宽而药丸被 `max-width: 620px` 截断。删除该限制（药丸在 `.turn-container-body` flex column 内默认 stretch，自然与分割线等宽），pending/approved/denied 三态与前台背景下的药丸一并在内。三张验收截图已在新样式上重拍，画面与 DOM 签名同步验证；typecheck / lint / vitest 620 全绿。**Status 保持 ready-for-human**。
