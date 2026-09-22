# PiCode 1.8 批次终验总报告（2026-09-22，HEAD=331922e，19 票全合入）

## vitest 全套
`env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT npm test`：**绿**（123 文件 / 2153 用例，exit 0）。

## typecheck
`npm run typecheck`：**绿**（node+web 两套 tsc，exit 0）。

## smoke:host（host-contract）
两次跑均死于任务书已知的 **t131/t134 留档 flaky 族（A/K 轮）**，重跑一次后按指令记录不追：
- 跑 1：Round A–J 全 ok（t104/t77/t71/t80/t79/t89/t90/t96/t99），死 Round K（t101 live stop 超时未被接受：`ok=false, "the steer request timed out"`）
- 跑 2：死 Round A（t104 abort 后 `agent_end 1` 90s 超时）
- 其余到达 round 全绿；两次死点形态不同 = flaky 族特征，与 t134 票内 stash 基线同死留档一致

## smoke:electron 全套终位跑（3 次尝试，重试纪律用满）
- **未取得终位全套绿**；三次死点互不相同且各死点在其他轮次同 HEAD 全绿——**无确定性阻塞，全部为 UI 时序/几何/焦点瞬态**（操作员活跃期抖动谱系）
- 尝试 1：死 t105 leg2（trusted keystroke 未回显；smoke 代码自注 t44 环境类）——此前 14 段全绿含 **t44 剪贴板腿（批次内首次终位通过）**
- 尝试 2（最远，37/73 段全绿）：死 **t117**（已知 flaky 族；CJK 草稿溢出腿 scrollH=clientH=146；票面留档=边界宽度几何敏感+settle-poll 修复史；绿跑史=t117 票 smoke5/6+09:4x 前移位 suite 全绿）。t105 全腿绿（**t132 合入后批次内首次**）、t132 三腿绿、t75/t93 绿、t120/t123/t131/t116/t119/t121/t122/t126 全绿
- 尝试 3：死 t122 R4（popover bbox 在 provider hover 下移 182px；该段尝试 1/2 绿；t122 合并记录「一次偶发抖动复跑两次全绿」同谱系）

## t1xx 新段到达矩阵（终位，按尝试 2 最远口径）
✅绿：t116/t119/t120/t121/t122/t123/t126/t131/t132（+t132 boot-empty 三跑全绿；t44 亦三跑全绿）
❌死于：t117（已知 flaky 族）
❌未到达（t117 之后 36 段）：t118（skill_keep_text）、t124/t125（usage 两段）、t126 的 settings_mcp 侧、t127（settings 入口去重腿，settings_skills 内）、t128（queue_repair）、t129（thinking_memory）、t130（fork_auto_name）、t133（bubble_text_select）及 usage_hover/settings_skills/packages/settings_mcp/subagent_dir/subagent_chat/subagent_stop/newtask_switch/draft_preserve/command_card/ctx_ring/edit_resend/bubble_trio/rename_midrun/instant_card/fb107/timer_continuity/fork_auto_name 等旧段——原因：三跑分别死于 t105/t117/t122，后续段无机会到达（这些段在本批次各票验证时均有绿跑史，vitest 单测层全覆盖）
t134：sanitized-spawn 腿为独立调用（PICODE_SMOKE_STAGE=t134-sanitized），不属全套路径，本轮未跑（票内已留档验证）

## 环境状态
跑前跑后 ps 自查均无遗留 electron/PiCode 进程；根工作区零改动（仅 .scratch 日志新增）；零 commit、零 push、零 tag、零 merge。

## 证据文件
- /tmp/final-regression-vitest.log（vitest）
- /tmp/final-regression-typecheck.log（typecheck）
- /tmp/final-regression-smoke-host.log + -retry.log（smoke:host 两次）
- /tmp/final-regression-smoke-electron.log + -retry.log + -retry2.log（三次）
- .scratch/picode-1-8/final-regression/{01-vitest,02-typecheck,03-smoke-host,04-smoke-electron,00-summary}.md
