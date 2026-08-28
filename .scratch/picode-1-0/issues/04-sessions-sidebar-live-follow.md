# 04: 会话体系与侧边栏 + Live Follow

**What to build:** 任务列表按项目目录分组呈现 Pi 会话存储中的全部 Session（含 TUI 创建的），带相对时间与置顶；⌘N 新建任务；resume 任意会话、in-place 树导航（回分支、跳 entry）、fork；任务重命名写回 Pi session label；**Live Follow**：正在 TUI 中运行的 Session 在列表中显示活跃态，点开为只读实时刷新视图。

**Blocked by:** 02 Host 活体。

**Status:** resolved

- [x] TUI 新建的会话自动出现在对应项目分组，时间/置顶/重命名生效
- [x] 双向无缝衔接：这里 resume 的会话与 TUI 继续的是同一条历史
- [x] 树导航可切换分支并继续对话，分支路径不丢失
- [x] Live Follow 只读旁观：TUI 流式进行时实时刷新，且 PiCode 侧零写入（并发保护默认策略）
- [x] 侧边栏交互对照截图 01/02 左栏形态（分组行、筛选行、底部账户区）

## Comments

- **Commit:** `8151a36` feat(sessions) + `da55979` review refactor，已 rebase 到 main `36d2673`（解决与 t06/t10 的冲突 + 修复合并后暴露的两个竞态：时钟偏斜导致活跃点丢失、被替换 host 的 host_exit 清空新会话，见 `27d2350`）。**已合入 main：`57eb61b`**（合并后 main 全绿：210 tests / typecheck / eslint / 双冒烟重跑通过）。
- **Unit/type/lint:** 112 vitest tests green（新增 31：sessions-parse 15、sessions-group 9、sessions-index 6...）；`npm run typecheck` 双 tsconfig green；eslint green。
- **Headless contract smoke**（`npm run build && node scripts/smoke/host-contract-smoke.mjs`，真 SDK）：SMOKE PASS —— 新会话流式+中断+第二轮 → shutdown → 以同一文件 resume（`resumed=true`，history_loaded 回放 4 条）→ `set_session_label` 写回（`session_renamed` + 树内可见）→ `navigate_tree` 落叶到指定 entry（leaf 移动、旧分支保留在文件）→ `fork_session`（position 'at'，新 session 文件，路径仅含根→目标）→ PASS。双向 Handoff 即证：resume 打开的就是 SDK/TUI 写的那个文件。
- **Electron smoke**（`PICODE_SMOKE=1 npx electron .`）：SMOKE PASS 全链 —— 聊天回路 + renderer DOM + `sidebar_index_ok`（本 smoke 创建的会话经真实 index→IPC→DOM 出现在侧边栏）+ Live Follow 三步（向非活跃会话文件模拟 TUI 追加一行 → 行内出现活跃圆点 `follow_live_state_ok` → 点击行打开只读视图 `follow_view_opened` → 追加内容实时出现 `follow_streamed_ok`）。退出无孤儿 host 进程。
- **Zero-write 结构性保证：** Live Follow 全路径只读（`open('r')`/`readFile`），FollowView 无 composer；唯二写点均有意为之：rename 写回（本票要求）与经 host 的会话写入（SDK）。
- **决策记录（已与既有策略一致）：** ①"活跃态"= 会话文件 120s 内有写入（无法在不引入平台特定手段时区分"TUI 打开但空闲"）；②非活跃会话重命名由主进程按 SDK 同形 append `session_info`（链到文件序 leaf，防御半行尾）；活跃会话重命名走 host `setSessionName`，避免 host 内存 leaf 失配；③fork 改走 SDK `AgentSessionRuntime.fork`（与 TUI 同语义，in-host 切换），`fork_created` 事件保留但不再触发 resume。
- **对照截图 01/02：** 左栏形态已复刻（New Task/Search 行 + ⌘N/⌘K、分组/项目 pills、筛选行、Pinned 区、项目分组行含 chevron/grip、行内相对时间、底部账户区显示当前会话）；像素级人工验收留待操作者（spec 硬关卡）。

- **验收（主会话，8/28）**：合并 sha `57eb61b`（操作者已于合并前目检验收）。复验：Live Follow 零写入、树导航、label 写回均按票面验收标准落地。关闭。
