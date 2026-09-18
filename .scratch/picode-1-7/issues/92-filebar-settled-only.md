# 92: 回合文件条 settled-only

**What to build:** 回合文件条改为**落定后才显示**：live 全程不渲染条；agent_end 落地瞬间原位出现（正文下方/容器后，构图不变）；**Stop/中断/出错回合照出条**（文件更改是事实投影，与回合成败无关）；FollowView 同规则。

**背景（取证）：** 现行为 = 票 78 交付「live 随工具落定增长」——`turn-collapse.ts:114`（live turn 携带 fileChanges）+ `ChatView.tsx:354`（`fileChanges.length>0` 即渲染，无 settled 门）；操作者真实使用判为干扰（1.7 第一条痛点）。

**Blocked by:** 82（live 回合纯时间序——同 turn-collapse/ChatView 区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：live 回合不携带 fileChanges（分组模型门）；落定回合照常聚合——票 78 全部聚合语义（edit ± 解析/write "+new"/同文件合并/read 排除/无更改无条）零回归
- [x] electron smoke：live 无条 → agent_end 落地原位出现；**Stop 中断回合条照出**；无更改回合无条
- [x] FollowView 同规则（settled-only 投影）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-18 (implement, t92-filebar-settled，based on main 44fa8a4 含票 82 基座)：落地完成，**纯投影零契约增量**——功能性改动只有 Seam-1 一行门：
  - `src/shared/turn-collapse.ts`：`groupTurns` 里 `fileChanges: live ? [] : aggregateTurnFiles(...)`——live 回合（agentRunning 时的最后一个 draft）不携带 fileChanges，条在 agent_end 落地瞬间一次性原位出现（正文下方/无正文回合容器后，构图不变）。`aggregateTurnFiles` 本体零改动——票 78 全部聚合语义（edit ± 解析 / write "+new" / 同文件合一行 / read 排除 / 无更改无条）对落定回合逐字节同构。**Stop/中断/出错照条**：三者都走 chat-reducer 的 `settle(state, false)`（agentRunning→false → 回合转落定态 → 聚合照常）；真实 Stop 的 host 路径即 abort → SDK 以 agent_end 收束（src/host/index.ts case 'agent_end'），被中断的工具由 settle 标 error 不计入、已落定 edit 照常聚合——文件更改是事实投影，与回合成败无关。
  - FollowView 同规则：恒走 `groupTurns(entries, false)`（回放即落定态，票 82 既有架构），模型门同路径生效，代码零改动（注释更新）。新增 vitest 锁定 follow 投影（TranscriptItem→replayEntry→groupTurns(false) 照出落定条）。
  - `ChatView.tsx` / `FollowView.tsx` 渲染条件 `fileChanges.length > 0` 不动（模型已保证 live 为空），仅注释更新；`turn-files.ts` 仅文档字符串（门归属上移至 groupTurns 的票 92 注记）；`contract.ts` 零改动。
  - CONTEXT.md「回合文件条」词条 rider 入册（票 82 评审预留）：settled-only 语义 + live 随工具落定增长退役 + _Avoid_ 增「live 同构」。
  - vitest：票 78 describe 改写 2 项 + 新增 3 项（live 门 / settle 转录序聚合 / done edit 门 / Stop 中断条 / turn_error 条 / FollowView 投影）；全套 1643/1643 绿，typecheck 双 tsconfig 清，eslint 清。
  - electron smoke turn_filebar 阶段扩展票 92 live 段（无模型调用、fake contract events）：⑤ live 带 done edit 无条（`turn_filebar_live_no_bar_ok`）→ agent_end 落地原位（lastElementChild = 条 + previousElementSibling = 容器 + 汇总 '1 file changed'，`turn_filebar_live_settle_in_place_ok`）；⑥ Stop 中断回合（done edit + 被杀工具 → agent_end）条照出且仅计 done edit（`turn_filebar_stop_live_no_bar_ok` / `turn_filebar_stop_turn_bar_ok`）；⑦ 无更改回合 live+落定均无条（`turn_filebar_live_no_change_no_bar_ok`）。票 78 原四探针照常绿（落定零回归）。**全套 `npm run smoke:electron` exit 0**（run5）。
  - visual filebar harness 增 fb3 两帧（PICODE_VISUAL_FILEBAR=1）：fb3a live 流式无条 / fb3b agent_end 后条在正文下方——断言全绿，截图入册 `.scratch/picode-1-7/visual-t92/fb3a-live-no-bar.png`、`.scratch/picode-1-7/visual-t92/fb3b-settled-bar-in-place.png`（fb1/fb2 落定回归帧同目录照常绿；另有 /tmp 副本）。
  - dev-app serialization：每次跑 smoke/visual 前 `ps` 自查。**两次让路**：wt-90 的 smoke:electron 在跑（run8 中途 probe fail 退出 / run11 全绿 done），等其退出后自查零进程再跑本票。另注：本会话 shell PATH 不含 node_modules/.bin，electron-smoke.mjs 的 `spawnSync('electron')` 需 `PATH="$PWD/node_modules/.bin:$PATH"` 前缀 + `env -u ELECTRON_RUN_AS_NODE`（票 82 同款环境注记）。
  - **无人值守 smoke 环境性 flake（非本票引入）**：run2 卡 ticket-45 self-send、run4 与 stash 基线（HEAD 未含本票改动）同卡 ticket-75 held-away own send、基线另卡 ticket-91 mask-click——均为真模型调用/焦点敏感探针的无人值守失败；run5 全绿闭环（含全部上述阶段）。
- 2026-09-18 (code-review，两轴并行子代理 workflow 94d438b9)：/code-review 双轴各一 reviewer 子代理并行（本会话 spawn 可用，无 T81 的 pid blocker）。**Standards：OK with notes**（零 hard violation——additive-only 契约 ✓ / 全英文 ✓ / CONTEXT.md 词条一致 ✓ / ADR 无涉 ✓）。**Spec：OK**（四验收项逐条 evidence-verified，无 P0/P1）。P2 注记三项：① FollowView live-follow 残留——follow 中被跟随会话仍在流式时，其 in-flight 回合按落定投影照出条（FollowView 恒 `groupTurns(entries,false)` 是票 82 既有架构，spec 括号「settled-only 投影」明示如此）——两轴均记 record-only 不阻塞，操作者若觉干扰可另立票把 follow `live` 传入末回合 liveness；② smoke/visual 的 filebar DOM sig 构造重复（票 78 既有形状，本票两处各延伸）——留待顺手提取共享 helper；③ `toolsInOrder` 先算后门——**已修**：门提前，live 回合不再做废弃 flatMap（commit 内）。修复后 vitest 1643/1643 + typecheck + visual harness fb1–fb3 复跑全绿（fb3 帧复验截图同路径）。
- 2026-09-18 (merge session，per 操作者验收指令「92 工单已验收」)：Status 翻转 ready-for-human + 四验收框按 Comments 既有证据链勾选（implement 全项落地 / code-review 双轴 Standards OK-with-notes + Spec OK、P2 注记三项含一项已修）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。**CONTEXT.md「回合文件条」词条 rider（票 82 评审预留的收窄）已随票入册**，合并时核对。
