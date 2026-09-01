# 20: 多活动会话——并存与追平（推翻 α 形态，痛点 1B 核心）

**What to build:** 单窗口内多个会话**同时处于运行态**：切换/新建**不再终止**正在跑的会话；后台会话的 host 进程与流事件持续存在，**仅视图不渲染**（事件继续收集、切回重挂载追平实时流——ZCode 同机制，操作者确认）。配套**侧栏状态点固定槽位**：动画点 = 本应用运行 / 绿点 = TUI 在写（120s 规则）/ 空槽 = 空闲，**所有行标题左缘对齐**（修掉现状条件渲染导致的 9px 错位——`.sb-live-dot` 仅活行渲染）。

**边界（grilling R3-Q3 定稿，本票范围）：**
- 切回交互：**完整可交互**（"后台只是不渲染"——host 照常执行、会话文件照常增长，仅屏幕不刷新）。
- 数量：**不设硬上限**（每会话独立 host 进程，超载用户自负）。
- 退出：**全部终止**（"退出无孤儿"承诺不变）；会话文件保留，resume 可续。
- 两端并发写：维持**不做仲裁**（spec 原样 out of scope）。
- 后台审批 UX（药丸挂起 + 橙角标 + 系统通知）**拆至票 25**。

**背景：** 操作者裁定 α 形态（切走即杀进程，supervisor 替换语义）不足以日常使用。ADR-0003 已按 β 形状设计（每会话独立 host 进程），升级无需架构重写，但**推翻 α 交付形态须先落 ADR**。

**ADR-0006（实施时落盘，先于动工）**：hard to reverse / surprising / real trade-off 三条全中（备选：维持 α + 队列化、双窗口）。至少记录：多 host 并存与单窗口视图挂载的关系、后台渲染策略（不渲染 + 追平）、退出语义。

**Blocked by:** None（建议 14 之后实施——两者都动 chat 视图层与 reducer 装配）。

**Status:** ready-for-human

- [x] 切走运行中会话：host 不被终止（对照现状替换语义），后台流事件持续收集、会话文件持续增长
- [x] 切回：视图重挂载追平最新状态并恢复实时流；转录无缝、无重复条目
- [x] ≥3 个会话并存运行实测（新建/打开互不干扰）
- [x] 退出：N 个 host 全部终止、无孤儿（shutdownAll 扩展到多实例）
- [x] 崩溃隔离回归：任一 host 崩溃仅该会话报错横幅，其余不受影响
- [x] 会话注册表纯模块（sessionId → 视图状态 + 焦点路由；chat reducer 原样复用）vitest 表驱动
- [x] 侧栏状态点固定槽位（动画/绿/空）+ 标题左缘全线对齐（像素核对留人工视觉 QA）
- [x] **ADR-0006 落盘后再合并**
- [x] smoke 六阶段 + 多会话并存新场景；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): R2-Q7「全部做……不要留给下次」——五边界当场定稿；两端并发写维持 out of scope。
- 2026-08-31 (/to-tickets 重切): 后台审批 UX 拆至**票 25**；本票 = 并存与追平核心 + 状态点固定槽位 + ADR-0006。
- 2026-09-01 (t20 实现，f654bb9 + b783171): 全部验收项落地。契约纯增量：`session_event`/`session_detached`/`session_command` + `SessionCommand`/`SessionScopedEvent` 类型重命名级提取（无成员删除/改名）。supervisor = sessionId↔host 注册表：同 host 换会话（fork）广播 `session_detached`，同 id 重公告（对本应用仍持有 host 的会话做全量 resume 接管）静默置换旧 host；退出 shutdownAll 全终止。渲染层唯一新状态模块 `src/shared/session-registry.ts`（27 表驱动 vitest）：每会话各折叠一份 chat reducer，后台事件持续收集不上屏，切回重挂载追平；失败 spawn（session_error/host_exit 未公告 id）聚焦其防御条目让横幅可见（α 对齐，review 轮修复）。侧栏固定槽位 `.sb-dot-slot`：`.sb-run-dot`（本应用运行，蓝+脉动）/`.sb-live-dot`（另一端在写，绿、静置）/空槽；本应用会话永不显示绿点（mtime 是自己的）。所有会话级命令显式定向（`session_command` → focused）；后台在应用会话重命名改走其 host。smoke 新增票 20 场景（多会话并存、后台流 + 文件增长、同 pid 切回无重复、定向 abort、SIGKILL 单会话隔离、shutdownAll 零孤儿）+ follow 阶段前置 SIGKILL 重建 host（恢复 α 前置：被跟随会话不得在本应用内持有 host）。smoke 全套 ALL GREEN（6 阶段）；typecheck / lint / 556 tests 全绿；visual harness 20/20 截图（legacy 未包装事件兼容路径验证）。code-review：两轴各 2 项发现，均已修复（fail-spawn 横幅回归 + 文件增长断言 + 缩进/文档/测试类型清理）。像素级对齐与动画/配色留人工视觉 QA 关。**Status: ready-for-human** — 请操作者 `bash scripts/merge-ticket.sh 20`。
- 2026-09-01 (验收截图补齐，bc8b8d1): 新增 `npm run visual:multi` 关卡（`src/main/visual-multisession.ts`，独占窗口）：产出入库 `.scratch/visual/m1-multi-dots.png`（三态点同框：A 蓝色动画点后台运行 / B 绿点 TUI 在写 / C 空槽在应用空闲；三行标题左缘对齐）与 `.scratch/visual/m2-refocus-caughtup.png`（点击后台行 → 同 pid 聚焦、追平转录、实时流恢复）。像素核对可直接对照这两张 + `npm run visual:transcript` 回归套图。
- 2026-09-01 (17 整合，25cf50b): rebase main@374ac2a（t17-newtask-chips）完成。App.tsx 架构冲突按注册表脊柱解决：newTaskOpen/startTask/Escape/下拉接线全保留；dismissedError 弃本地 state（注册表 per-session `dismiss_error`）；newTaskDefaultProject/recentWorkspaceList 锚 focused 会话 cwd。smoke 同一插入点先 17 newtask 阶段（Scoped waiter 适配，un-targeted abort 走 most-recent-host 回退）后 20 multi 阶段，并集全绿。截图全部在整合代码上重拍：0-empty-state 同框含 17 芯片 + 20 绿点/空槽（转录 harness 现播种确定性隔离存储，shared `visual-store.ts`），0a 下拉、m1/m2、全套装图同步更新。vitest 573 / typecheck / lint / smoke 六阶段 ALL GREEN；code-review 两轴无硬违规（17 芯片断言的 settings 依赖为已验收同源项）。**Status 保持 ready-for-human**。
