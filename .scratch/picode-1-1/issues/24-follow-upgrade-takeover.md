# 24: Follow 升级——markdown 渲染 + Open 转正

**What to build:** Live Follow 视图两项升级：
① **结构化 + markdown 渲染**：FollowView 消费票 14 的结构化条目，渲染 markdown 与折叠态思考行/工具卡（现状纯文本 div，`##`/`**` 裸露——实拍 `pi-follow-raw-markdown.png`），保持严格零写入。
② **Open 转正**：目标会话非活跃（>120s 无写入）时出现「Open」；点击瞬间**重查活跃态**——仍活跃则 toast「仍在另一端运行」不转正，否则以既有 resume 链路完整打开（自动切换到该会话）。会话活跃时不出该按钮。

**背景（取证）：** 操作者实测：活会话点击进 Follow 后视图无出口（仅 Stop following）、TUI 停后仍锁只读；FollowView 现渲染纯文本（`pi-follow-raw-markdown.png`）。

**Blocked by:** 14（消费其结构化载荷）。

**Status:** ready-for-human

- [ ] Follow 视图 markdown 渲染（对照 `pi-follow-raw-markdown.png` 修复裸露标记）
- [ ] Follow 视图含折叠态思考行/工具卡（消费票 14 结构化条目）；严格零写入回归
- [ ] 非活跃时出现 Open；点击重查活跃态——活跃 toast 拒绝 / 非活跃 resume 完整打开、无重复条目
- [ ] 活跃时不出 Open 按钮
- [ ] electron smoke follow 场景扩展（转正链路断言）；`npm run smoke` ALL GREEN
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 14 拆出（原 (a) 转正与 (c) 渲染两缺口合并为一票；取证 `pi-follow-raw-markdown.png`）。
- 2026-08-31 (implement session, t24-follow-takeover): 已实现并提交 **daf3de1**，未自行 merge —— 请操作者运行 `bash scripts/merge-ticket.sh 24`。要点：FollowView 消费票 14 结构化条目并复用 live 同一套渲染路径（Markdown / ThinkingRow / ToolCard 抽入共享 `TranscriptEntry`，chat/replay/follow 三面同构），严格零写入不变；Open 仅在非活跃（>120s）渲染，点击瞬间以新鲜 `sessions.list()` 重查活跃态（纯缝 `decideFollowTakeover`，表驱动 vitest 落 sessions-group 套件）——仍活跃 toast 拒绝（文案常量与冒烟断言共享），安静则走既有 resume 链路完整打开（`resumeSession` 与侧栏同路径，session_created 自动切换，history_loaded 整表替换无重复条目）；App 级 30s liveness tick 保证安静翻转真实可达。electron smoke follow 场景扩展为完整转正链（结构化 follow 渲染 / live 无 Open / 唤醒拒绝 / 安静转正 + 票 14 DOM 断言全部经由按钮链路）；顺带修复冒烟夹具：模拟 TUI 回合改用唯一 entry id（重复 id 会使 resume host exit 1）。验证：typecheck/lint 全绿、vitest 491/491、`npm run smoke` ALL GREEN（6/6）。code-review 双轴：Standards 0 硬违规（3 处判断项均已内联修复或记录理由）、Spec 0 缺口 0 越界。
<<<<<<< HEAD
- 2026-08-31 (implement session): 验收实拍入库 **fbe504c** —— `.scratch/compare/t24-follow-structured.png`（① 渲染升级：markdown + 折叠思考行 + 终态工具卡，live 无 Open）、`t24-follow-open.png`（安静后 Open 出现）、`t24-follow-rejected.png`（唤醒竞态 toast 拒绝）、`t24-takeover-resumed.png`（转正后完整打开，与 live 同构）。均由 electron smoke 真实链路在关键时刻捕获。
=======
>>>>>>> e47dc9a (chore(tracker): 24 implemented (daf3de1) — ready-for-human, awaiting operator merge)
