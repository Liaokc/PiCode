# 24: Follow 升级——markdown 渲染 + Open 转正

**What to build:** Live Follow 视图两项升级：
① **结构化 + markdown 渲染**：FollowView 消费票 14 的结构化条目，渲染 markdown 与折叠态思考行/工具卡（现状纯文本 div，`##`/`**` 裸露——实拍 `pi-follow-raw-markdown.png`），保持严格零写入。
② **Open 转正**：目标会话非活跃（>120s 无写入）时出现「Open」；点击瞬间**重查活跃态**——仍活跃则 toast「仍在另一端运行」不转正，否则以既有 resume 链路完整打开（自动切换到该会话）。会话活跃时不出该按钮。

**背景（取证）：** 操作者实测：活会话点击进 Follow 后视图无出口（仅 Stop following）、TUI 停后仍锁只读；FollowView 现渲染纯文本（`pi-follow-raw-markdown.png`）。

**Blocked by:** 14（消费其结构化载荷）。

**Status:** resolved

- [ ] Follow 视图 markdown 渲染（对照 `pi-follow-raw-markdown.png` 修复裸露标记）
- [ ] Follow 视图含折叠态思考行/工具卡（消费票 14 结构化条目）；严格零写入回归
- [ ] 非活跃时出现 Open；点击重查活跃态——活跃 toast 拒绝 / 非活跃 resume 完整打开、无重复条目
- [ ] 活跃时不出 Open 按钮
- [ ] electron smoke follow 场景扩展（转正链路断言）；`npm run smoke` ALL GREEN
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 14 拆出（原 (a) 转正与 (c) 渲染两缺口合并为一票；取证 `pi-follow-raw-markdown.png`）。
- 2026-08-31 (implement session, t24-follow-takeover): 已实现，rebase 到 main(76ba2d7) 并与票 23 turn 架构完成语义整合，提交 **9c0eb80**，未自行 merge —— 请操作者运行 `bash scripts/merge-ticket.sh 24`。要点：FollowView 消费票 14 结构化条目，经 `replayEntry` 映射后渲染与 chat 视图**完全相同**的 turn 架构（`groupTurns` + `TurnContainer` + `AnswerBlock`，后两者抽为共享组件）——三面共用发生在 turn 架构层；原 `TranscriptEntry`（整条目渲染器）与回合折叠的形状（work 进容器/answer 在外）冲突，已删除并在此声明。Follow 展开态为视图本地 UI 态（严格零写入不变）；无 fork 供面（fork 须经 active host）。`TurnContainer` 的 approve/deny 改为可选（无闸门面不渲染审批药丸）。Open 仅在非活跃（>120s）渲染，点击瞬间以新鲜 `sessions.list()` 重查活跃态（纯缝 `decideFollowTakeover`，表驱动 vitest 落 sessions-group 套件）——仍活跃 toast 拒绝（文案常量与冒烟断言共享），安静则走既有 resume 链路完整打开（`resumeSession` 与侧栏同路径，session_created 自动切换，history_loaded 整表替换无重复条目）；App 级 30s liveness tick 保证安静翻转真实可达。electron smoke follow 场景按票 23 折叠闸门重排：follow 内折叠断言→程序化开容器→内层审计（思考行/工具卡/1 错误卡/无时长）→live 无 Open→唤醒拒绝→安静转正→replay 折叠断言→开容器→审计→自动切换断言，全部经由按钮链路；开容器助手循环点击仍关闭容器直至全开（容器可跨多次 tail 更新挂载）。顺带修复冒烟夹具：模拟 TUI 回合改用唯一 entry id（重复 id 会使 resume host exit 1）。复核：main 的 `replayEntry` 与 23 前逐字节一致，产物即 `groupTurns` 消费的形状，export 保留。验证：typecheck/lint 全绿、vitest 529/529、`npm run smoke` ALL GREEN（6/6，含折叠闸门）。
- 2026-08-31 (implement session, rebase 后重拍): 验收实拍随 turn 架构刷新入库 **9408406** —— `.scratch/compare/t24-follow-structured.png`（① follow 内 Worked 容器 + 思考行/工具卡，live 无 Open）、`t24-follow-open.png`（安静后 Open 出现）、`t24-follow-rejected.png`（唤醒竞态 toast 拒绝）、`t24-takeover-resumed.png`（转正后完整打开，turn 架构 + fork 供面回归）。均由 electron smoke 真实链路在关键时刻捕获。

- 2026-08-31 (merge session, T00): merged as **5e962fb** (`merge: t24-follow-takeover`, rebase 零冲突 + no-ff onto main)。验收口径：操作者明确「已验收」×2——首轮合并因语义级冲突中止（TranscriptEntry 与 23 的 turn 架构对撞 + follow smoke 与折叠闸门互锁），退回实现会话；实现会话以 9c0eb80 完成整合：TranscriptEntry 废弃，`AnswerBlock` 抽为共享组件（ChatView 传 onFork——fork 无回退；FollowView 只读不传，注释写明理由），「三面共用」落到 turn 架构层（groupTurns + TurnContainer + AnswerBlock）；takeover 链按折叠闸门重排并 smoke 重跑。合并会话终态审计通过（fork 接线/共享组件/互锁探针与整合结果一致）。合并后 main 上 typecheck + vitest 529/529 全绿。
