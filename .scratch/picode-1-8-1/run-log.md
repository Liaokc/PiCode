# PiCode 1.8.1 执行会话 run-log（恢复式账本）

> **恢复入口（§0 指南）**：任何会话（含 compact 后的本会话）恢复时，重读本文件即可接续。
> 顺序：读 §1 账本定位每票状态 → 读 §2 检查点确认波次推进到哪 → 从 §3 事件流末尾的事件
> 时间戳接续。**每次行动前先写账**（§1/§2/§3 同步更新），每完成一个动作回写。
> 契约：docs/agents/development-contract.md；手册：.scratch/picode-1-8-1/session-prompts.md；
> spec：.scratch/picode-1-8-1/spec.md。
>
> 批次：依赖升级批（SDK 0.87.1 × pi-subagents 0.71.0 × pi-mcp-adapter 2.37.0）
> 票：144（forkHost env-strip，harness 微票）/ 146（SDK bump）/ 147（subagents 071 探针，Blocked by 146）/ 148（adapter 2.37 fidelity）
> 波次：W1 = 144+146+148 并行（≤3）→ W2 = 147 → 收尾全量回归
> 模型分派（操作者原话）：每票 worker = bella-local/GLM-5.3 + thinking max
> Linear 镜像：LIA-205=144 / LIA-211=146 / LIA-212=147 / LIA-213=148，起步 Todo
> 红线：不 push / 不打 tag / 不 release；执行会话不 checkout 不实现票（worker 在 worktree 实现，
> 合并只经 scripts/merge-ticket.sh）；不碰 ~/.pi 环境。

## §1 账本（每票状态 × sha × 评审 × 验证）

| 票 | 分支 | worktree | 状态 | worker sha | 评审方式 | 评审结论 | 验证记录 | merge sha | Linear |
|---|---|---|---|---|---|---|---|---|---|
| 144 | —（已清） | — | **已合入 main** | bbb38be（rebase 后 ac4e0d9） | 双轴：standards approve + spec pass（均 0 must-fix） | 过 | 污染 env smoke:host 全套 PASS（Round K 复活）+ 干净 env 对照 PASS；vitest 2189/2189；eslint touched 0 错；bash -n 过；合并后 main 验证过 | e02da9f | LIA-205 Done ✓ |
| 146 | —（已清） | — | **已合入 main** | b87d190（rebase 后 f2d6b41） | 双轴：standards approve + spec pass（均 0 must-fix） | 过（(c) 兜底裁决） | vitest 2189 绿；bundled-sdk-versions 5/5；typecheck/eslint 绿；smoke stage 1-5 多轮全绿（host ×4/pty ×4/usage ×2/interop 双向 ×3）；stage-6 负载 flake 文档化；全套绿+package:verify = 收尾门硬义务；合并后根同步 0.87.1 npm test 2193/2193 绿 | 89528dd | LIA-211 Done ✓ |
| 147 | —（已清） | — | **已合入 main** | ebf8e6b（rebase 后 ddb093e） | 双轴：standards approve + spec pass（均 0 must-fix） | 过（env-hygiene 块裁量通过） | smoke:subagents071 活跑 PASS（0.71.0 × 0.87.1 实读配对）；grep 残留 0；vitest 2193；typecheck ×2；eslint touched 0；合并后 main 验证过 | 4ce37ec | LIA-212 Done ✓ |
| 148 | —（已清） | — | **已合入 main** | 854a6a1（rebase 后 fcc5469） | 双轴：standards approve + spec pass（均 0 must-fix） | 过 | vitest 2193/2193；typecheck/eslint touched 绿；smoke:host 全套（G/I 绿）；smoke:electron MCP 段 16 断言绿；jev 共存单测绿；合并后 main 验证过 | 854593d | LIA-213 Done ✓ |

## §2 检查点（波次推进）

- [x] CP-0 前置自检全过（环境核对 / spawn 自检 / 基线 tag / merge-gate 补位 / 参照帧核对）→ 方可派 W1
- [x] CP-1a 148 全链完成（worker → 双轴评审 → 合并 854593d → Linear Done）；144 全链完成（worker → 双轴评审 → 合并 e02da9f → Linear Done）；146 worker 跑中
- [x] CP-2 W1 三票合入 main：144 = e02da9f / 146 = 89528dd / 148 = 854593d
- [x] CP-3 W2 票 147 全链完成（worker → 双轴评审 → 合并 4ce37ec → Linear Done）
- [x] CP-4 收尾（部分完成，门被环境几何阻断——根因已实证，归操作者裁决）：npm install 同步 0.87.1 ✓ → npm test 2193/2193 全绿 ✓ → 全套 smoke：stages 1-5 + 7 全绿，stage 6 于 t136 断（显示器几何，基线 0.86.1 同败已证）→ package:verify：t105 断（焦点/回显时序，同类环境敏感断言；后续必遇 t136）
- [ ] CP-5 总报告 + 交棒：报告已出（含门阻断披露与解锁选项）；发版归操作者

## §3 事件流

- [EV-0001] 会话开目：读契约/spec/手册/四票面完毕；git 快照：main @ c53e411、仅根 worktree、
  无 picode-1-8-1-base tag。创建本 run-log。下一步：前置自检（环境核对 → spawn 自检 → 基线 tag →
  merge-gate 补位 → 参照帧核对）。
- [EV-0002] 前置自检全过：①环境核对 pi=0.87.1 / pi-subagents=0.71.0 / pi-mcp-adapter=2.37.0 /
  仅根 worktree 全符；②spawn 自检 delegate 回报 `c53e411 spawn OK`；③基线 tag picode-1-8-1-base
  已打于 main@c53e411（沿 1-1…1-8 先例）；④merge-gate 补位：merge-ticket.sh:50 ls-files 增
  .scratch/picode-1-8-1/issues/，提交 main = abfab25；⑤参照帧核对：本批无多模态票无参照帧需求
  （spec 明确，纯依赖/桥/探针面）——确认无需帧。CP-0 达成。
- [EV-0003] W1 派工：三 worktree 就位（wt-144-forkhost-env / wt-146-sdk-bump / wt-148-mcp-fidelity，
  均基于 main@abfab25），三仓 npm install 全 exit 0（旧锁）。Linear LIA-205/211/213 → In Progress
  + 派工注释已镜像。merge 流程确认沿 1-8 先例：worker 只改代码不动票面；评审过后 master 在
  main 上做票面同步提交（Status→ready-for-human + Comments 记录）再跑 merge-ticket.sh；分支与
  票面零冲突。smoke 错峰：共享锁 /Users/liaokechen/PiCode/.scratch/picode-1-8-1/smoke.lock
  （mkdir 原子，等待上限 90 分钟）+ ps 自查。三 worker = bella-local/GLM-5.3:max，3h 运行上限。
  等待三 worker 完成后进入双轴评审。
  worker async run id：144 = d10e79f7-d6bb-4584-ac72-63f1f9646f83；146 =
  bf06188b-d2d6-40a9-8683-950e2c86278b；148 = 498dc854-fa83-4a00-a74c-7c24a1f6175f。
  （恢复时用 subagent {action:"status", id:"<runId>"} 查进度/结果。）
- [EV-0004] （误报处置）worker-144 注意力信号：bash 开 240s。查实：代码理解完毕，已拿
  smoke 错峰锁（02:31）在跑 smoke:host（build+全套，长跑属预期），非阻塞；146/148
  work-notes 已开写。不 steer，任其继续。
- [EV-0005] （误报处置 ×2）worker-146 bash 240s = 锁等待（148 持锁跑 smoke:electron，
  electron . 在跑）。另：146 首跑全套时 usage 段幂等断言被兄弟会话 transcript 写入打破
  （usage-smoke.ts:80-86 两连扫真库要求 byte-identical）——环境性 flake 非产品缺陷；
  146 已自行根因、单跑验证机制完好、选安静窗口重跑（持锁者跑全套时兄弟都停在
  sleep 循环=安静窗口）。不 steer。任其自然推进。
- [EV-0006] （误报处置 ×3）worker-148 bash 240s = smoke:electron 长跑（正常）。进展：
  smoke:host 全套 PASS exit 0（Round G ticket-89 MCP OAuth 桥绿 + Round I ticket-96
  MCP 状态投影绿）；现持锁跑 electron smoke MCP 段。三 worker 均在设计轨道上。
- [EV-0007] worker-148 完成：分支 tip 854a6a1（单提交，恰好三文件 mcp-management.ts /
  mcp-status.ts / mcp-management.test.ts，+88/−7，worktree 干净）。三件交付全绿：两处
  fidelity 注释 2.37.0 + jev 共存 4 单测 + MCP smoke 段复核（smoke:host 全套含 Round G/I +
  smoke:electron MCP 段 16 断言）。过程披露：smoke:host 首跑（未剥 subagent 标记）Round K
  死——买证 144 泄漏面真实；剥标记后全套过（与 148 改动无因果）。注意点：148 验证时
  worktree 捆绑 SDK 仍为 0.86.1（W1 并行、146 未合），票面「× 捆绑 0.87.1」组合由 146
  全套冒烟 + 批次收尾全量回归覆盖（用户级 adapter 2.37.0 全程在位）。锁现由 146 持有
  （全套冒烟中）。下一步：派 148 双轴评审（review-standards + review-spec，
  bella-local/GLM-5.3:max）。
  148 评审 run id：review-standards = 65362803-ca2c-4506-bbde-2871d63e94b9；
  review-spec = 502c351b-c9bc-46c1-963c-f0a6a098c140（均 bella-local/GLM-5.3:max，只读）。
- [EV-0008] 148 双轴评审·spec 轴完成：pass（0 must-fix / 0 partial / 3 note）。三项票面
  全落地（两处注释逐条对应调研 §2.1/2.2/2.4；jev 三断言单测 test:119-127/237-247/407-428；
  smoke 证据标记逐一核实非杜撰）。超范围 note：lint type-import 修复零行为变化且属
  eslint-touched 验收面。SDK 0.86.1 偏差=可接受波次时序（收尾回归强制覆盖）。等 standards 轴。
- [EV-0009] 148 双轴评审·standards 轴完成：approve（0 must-fix / 2 minor / 4 nit；src
  非注释行过滤验证零行为面）。双轴均过 → 票面同步（Status ready-for-human + Acceptance
  勾选 + Comments 四记录）提交 main = 74764ed → merge-ticket.sh 148：rebase 干净、
  merge --no-ff = 854593d（worker 提交 rebase 后 fcc5469）、合并后 main typecheck +
  npm test 验证过 → worktree 已清、分支已删 → Linear LIA-213 → Done + 全记录注释。
  附：t144 已见 worker 提交 bbb38be（144 收尾中）；t146 worker 仍在跑（未提交）。
  W1 剩余：等 144/146 worker 完成 → 各自双轴评审 → 合并。146 合并后派 W2 票 147。
- [EV-0010] worker-144 完成：分支 tip bbb38be（两文件 +11/−2：forkHost env 剥离两标记
  同 hostForkEnv 语义 + run-all.sh host-contract 步 env -u 前缀）。验证：污染 env
  （PI_SUBAGENT_CHILD=1 + PI_SUBAGENTS_HERDR_BRIDGE=1）smoke:host 全套 PASS exit 0
  （Round K 旧死点复活，rounds A–L 全绿，/tmp/t144-smoke-tainted.log）；干净 env 对照
  PASS；vitest 2189/2189 绿；eslint touched 0 错；bash -n run-all.sh 过。残余风险：
  ①第三变量 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT 触发 subagent-runner-root.test.ts
  首例（git stash 实证 base 同败=既有环境敏感，operator-override-wins 语义，红线禁改
  测试代码）；②smoke 证据日志在 /tmp 易失。锁曾被外部 rmdir 一次，按协议重取完成。
  下一步：144 双轴评审（standards + spec，bella-local/GLM-5.3:max）。
  144 评审 run id：review-standards = 2016f1b5-6664-4509-a708-e4457bae755c；
  review-spec = ea2bc55e-a9e1-4bfd-95fb-fd2a4149d94a（均 bella-local/GLM-5.3:max，只读）。
- [EV-0011] 144 双轴评审·standards 轴完成：approve（0 must-fix / 0 minor / 2 nit）。
  核验：与 hostForkEnv() 逐字同语义（spawn-path.ts:193-197 对照）；注释根因链与真实错误串
  吻合；run-all.sh 前缀与 electron 阶段既有模式一致；env,...opts 展开保留调用方覆盖权；
  边界零产品/shared 改动。nit：delete 形状四处出现（repo 风格优先记录不阻塞）；双保险
  = 纵深防御非冗余。等 spec 轴（ea2bc55e）。
- [EV-0012] 144 全链闭环：spec 轴 pass（0 must-fix / 1 partial 判定语义等价 / 5 note）→
  证据归档（tainted/clean 两 log → work-notes/evidence-144/，tainted 尾行 SMOKE PASS）→
  票面同步（Status ready-for-human + Comments 四记录）+ work-notes 快照提交 main = 50ecdc6
  → merge-ticket.sh 144：rebase 干净、merge --no-ff = e02da9f（bbb38be rebase 后
  ac4e0d9）、合并后 main 验证过 → worktree 已清、分支已删 → Linear LIA-205 → Done +
  全记录。遗留候选（归操作者）：subagent-runner-root.test.ts 环境敏感跟进微票。
  W1 剩余：146 worker（跑中，四文件已改未提交）。146 合入后派 W2 票 147。
- [EV-0013] 146 worker 请求裁决（supervisor decision）：全套 smoke 绿跑被两类批内竞争
  阻塞——①stage-4 usage 真库两连扫被活性会话写入打破（实证 576→580：两 review
  transcript + 两 async session 文件）；②stage-6 electron 时序敏感段在负载 ~9 下 flaky
  （失败点漂移：session_error ×2 → ticket-105 PTY → ticket-136 panel drag，97+ 子断言
  每轮过）。分段证据全绿（host contract 两轮全套 95-98s、pty、interop 双向、
  bundled-sdk-versions 5 断言、vitest 2189、typecheck、eslint）。裁决：**(a)**——此刻
  144/148 已收口、无兄弟活动，master 即刻静默，worker 持锁一次性跑全套七段；两次安静
  尝试仍败则降级 **(c)**（分段绿 + 竞争面文档化，全套绿留收尾门）。master 自 EV-0013
  起静默至 146 下次报告。
- [EV-0014] 146 worker 完成（裁决 (a) 执行→两次安静窗 stage-6 仍 flaky→降级 (c)）：
  分支 tip b87d190（单提交四文件 +40/−36：package.json 锁版 0.87.1 / package-lock
  earendil 家族专属 diff / bundled-sdk-versions 断言+头注 / package.mjs 注释）。
  验证：vitest 2189 全绿（env -u 三变量）；bundled-sdk-versions 5/5；typecheck/eslint
  绿；smoke 1-5 多轮全绿（host contract ×4 全套 78-98s、pty ×4、usage 安静窗 ×2、
  interop 双向 ×3：捆绑 0.87.1 开全局 TUI 会话 177 entries + 全局 TUI 重开捆绑 host
  会话 marker 回读）；stage-6 electron 五次尝试失败点漂移（empty-state ×2 → t105 →
  t123@181s → t136@359s，190/400 子断言先过）+ lock diff 证渲染层零改动 → 既有
  UI 时序 flake 非本票回归；stage-7 + package:verify 留收尾门。第三变量
  PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT 触发 t111 幂等测试（与 144 发现同源，
  base 同败既有环境敏感）。下一步：146 双轴评审。
  146 评审 run id：review-standards = 6c71b9ae-e88e-48fe-87df-5c391381af0c；
  review-spec = ce7b00a6-529b-4079-afed-2a209984e924（均 bella-local/GLM-5.3:max，只读）。
  spec 轴任务含 (c) 兜底裁决的验收语义判定。
- [EV-0015] 146 双轴评审·spec 轴完成：pass（0 must-fix / 1 partial / 3 note）。四项改动
  逐项符合；五条 0.87.0 Breaking 与 diff 一致（src/ 零改动无适配代码）。partial = 票内
  未跑完整全套（stage 6 ×5 漂移失败 + stage 7 未达），判定满足验收语义（SDK 面 stage 2
  ×4 + stage 5 双向 ×3 全绿 + lock diff 零非 earendil 改动 + (c) 裁决留痕），但全套绿 +
  package:verify 升级为**批次收尾门硬义务**（main 串行安静环境；若 stage 6/7 仍败，
  批不得放行）——已纳入 CP-4 收尾检查点。note：第三变量 env 纪律合理（t111 base 同败）；
  lock 伴随产物无行为面；run-all 实为 7 段。等 standards 轴（6c71b9ae）。
- [EV-0016] 146 全链闭环：standards approve（0 must-fix / 1 minor：lock ignore@5.3.2
  dev:true 移除 = npm 重生成伴随产物零行为面，不手工恢复记录在案）→ 票面同步（含
  (c) 裁决记录）提交 main = 2b6539b → merge-ticket.sh 146：rebase 干净（b87d190 →
  f2d6b41）、merge --no-ff = 89528dd。⚠️ 合并脚本验证步在 merge 后跑 npm test 时
  bundled-sdk-versions 失败——纯因根 node_modules 未同步（0.86.1 vs pin 0.87.1），
  非代码问题；根 npm install 同步 0.87.1 后 main 全量 npm test 2193/2193 全绿
  （含 148 新增 4 单测）。worktree 已清、分支已删、Linear LIA-211 → Done。
  W1 全部合入：144 = e02da9f / 146 = 89528dd / 148 = 854593d。
  下一步：派 W2 票 147（前置已满足：146 已合入 main，git log 可见 merge: t146）。
- [EV-0017] W2 派工：票 147 worker 已派（run id = 73916d11-84d2-473d-acae-585346f96de0，
  bella-local/GLM-5.3:max），worktree .worktrees/wt-147-subagents-071 基于main@89528dd
  （含 146 合并），node_modules SDK 0.87.1 实装确认。Linear LIA-212 → In Progress。
  worker prompt 含三变量 env -u 纪律（t111 假红实证）与锁纪律。等 worker 完成 → 双轴
  评审 → 合并 → 收尾全量回归（硬义务：全套 smoke 七段 + package:verify）。
- [EV-0018] worker-147 完成：分支 tip ebf8e6b（5 文件 +105/−32：subagents-071-probe.ts
  更名+升位、package.json 脚本、subagent-bridge.ts:58 注释、index.ts/alignment.ts
  各补一句；package-lock npm churn 已还原=不入 diff）。验证：smoke:subagents071 活跑
  PASS exit 0（用户级 0.71.0 × 捆绑 0.87.1 实读配对；cost_envelope version=1 键全；
  externalProcess census presence-tolerant；三腿 complete/cancelled/failed 诚实投影）；
  grep 残留 0 命中（.scratch 历史提及按纪律保留）；vitest 2193；typecheck；eslint
  touched 0。⚠️ 超票面文字一处：probe 开头 env-hygiene 块（剥三标记 + 清 runner-root
  override + PI_PACKAGE_DIR）——活跑首败于 rpc ping 15s 超时的根因修复（0.71.0
  registerSubagentExtension 见 PI_SUBAGENT_CHILD 即不注册；operator-override-wins
  会把 runner 配对偏到 nvm 全局 pi）——票面验收「任意 shell 直跑 PASS」所必需，
  沿 t142/run-all.sh 先例；worker 已自flag 交评审裁量（一块可revert）。下一步：
  147 双轴评审（重点裁量 env-hygiene 块）。
  147 评审 run id：review-standards = e8cdbc28-f7cc-4911-bf16-ef2bcbc1926f；
  review-spec = 50feec9f-7f54-4cf6-8e7e-6dcf98e533ba（均 bella-local/GLM-5.3:max，只读；
  spec 轴重点裁量 env-hygiene 块）。
- [EV-0019] 147 双轴评审·spec 轴完成：pass（0 must-fix）。六项逐条落地；env-hygiene 块
  判定 = 票面验收必要实现非越权（评审员实读 ~/.pi 0.71.0 源码证实 registerSubagentExtension
  首行 PI_SUBAGENT_CHILD=1 即早退零注册；配对保护同证 operator-override-wins；t142/
  run-all.sh 先例成立；红线未破）。note：头注 two→three 腿陈旧修正属①范围；worker 举证
  已由评审结构核验补齐；.scratch 历史提及合规。等 standards 轴（e8cdbc28）。
- [EV-0021] CP-4 收尾：通道空闲 + npm test 2193/2193 官方绿 → 全套 npm run smoke
  （安静窗，单长调用期间会话静默）**FAIL @ stage 6 electron（515s 总时长）**：
  ticket-136「the side panel drag never committed its width」@400s；stages 1-5 全过
  （含 usage 幂等——真库安静验证）；session hygiene ok（594 不变）。与 146 worker
  安静窗失败点相同（t136@359s）→ 连续两安静窗同段失败，硬门触发前必须诊断：
  t136 是既有 flake 还是 0.87.1 引入。下一步：t136 段代码取证 + 负载核查 + 复跑。
- [EV-0022] t136 诊断（静态面）：拖拽实现 = startWidth 取 reducer panel.width，
  探针要求精确 560（隐含 panel.width=420 前提）；宽度状态机 = boot 快照回灌一次
  （App.tsx:362）+ 换面板继承持久化（App.tsx:1057-1075，t101 阶段可能提前触发）；
  全 smoke 仅 t136 两处 dragPane；t123 失败点=会话列表死 cwd 桶（与面板无关）。
  0.86.1 × 同序列绿（148 worker 实证）vs 0.87.1 安静窗 t136 ×2 —— 唯一产品行为
  差 = SDK bump → 疑似 SDK 事件时序扰动 UI 探针。实验：① main 0.87.1 复跑
  smoke:electron（第三样本）；② 若再败 → base tag 0.86.1 对照。
