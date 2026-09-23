# 144: forkHost 环境标记剥离——smoke:host 直 fork 路径的 PI_SUBAGENT_CHILD 泄漏口

**Status:** ready-for-human

**What to build:** 票 142 R2 修复了 electron 侧（hostForkEnv() 剥离 PI_SUBAGENT_CHILD/PI_SUBAGENTS_HERDR_BRIDGE + electron-smoke.mjs/run-all.sh 启动侧净化），但 `scripts/smoke/host-contract-smoke.mjs` 的 forkHost()（408-415）直 fork host 时不剥标记。从 subagent 会话驱动的 smoke:host 跑（worker 会话实测携带 PI_SUBAGENT_CHILD=1）→ host 内 pi-subagents 按契约拒注册 → Round K（ticket-101 subagent 段）死 "the stop request timed out (pi-subagents did not answer)"（143 实现工跑 1 实证；env -u 三变量后全套过）。

**修法**：forkHost() 的 spawn env 剥离 PI_SUBAGENT_CHILD 与 PI_SUBAGENTS_HERDR_BRIDGE（与 spawn-path.ts hostForkEnv 同语义：host fork 是顶层进程永非 child）；可选 run-all.sh 的 host-contract 步启动侧同步净化。

## Acceptance

- [x] 从携带 PI_SUBAGENT_CHILD=1 的会话驱动 `npm run smoke:host` 全套 PASS exit 0（不再需要 env -u 前置）
- [x] 干净 env 跑照常绿；vitest（env -u）全绿；eslint touched

**Red lines:** 只动 harness；产品/shared 零改动。

**Blocked by:** 无.

## Comments

- 2026-09-24（1.8.1 intake Q0）：操作者裁决**并入 1.8.1 批次**——本票作为 harness 微票入 1.8.1 波次表（纯 scripts/smoke 面，不阻塞任何票）；编号沿用 144、票文件留原地；状态维持 Todo 待波次派工。Linear LIA-205 已同步（addLabels iter:1.8.1，描述追加变更记录）。
- 2026-09-24（implementation，bbb38be）：forkHost()（host-contract-smoke.mjs:408-418）spawn env 剥离 PI_SUBAGENT_CHILD/PI_SUBAGENTS_HERDR_BRIDGE（{...process.env} + delete 两键，与 spawn-path.ts:193-198 hostForkEnv 同语义）；run-all.sh host-contract 步启动侧 env -u 前缀（票面可选项，与 electron 步 t142 先例同型）。12 调用点全走此 seam；产品/shared 零改动；package-lock 安装噪音已还原。
- 2026-09-24（verification）：污染 env（PI_SUBAGENT_CHILD=1 PI_SUBAGENTS_HERDR_BRIDGE=1 显式前缀驱动）smoke:host 全套 PASS exit 0（rounds A–L 全绿含 Round K ticket-101 subagent_stop 旧死点，/tmp/t144-smoke-tainted.log，已归档 .scratch/picode-1-8-1/work-notes/evidence-144/）；干净 env 对照 PASS exit 0；vitest 2189/2189（125 文件，env -u 三变量纪律）全绿；eslint touched 0 错；bash -n run-all.sh 过。
- 2026-09-24（dual-axis review）：standards **approve**（0 must-fix / 0 minor / 2 nit：与 hostForkEnv 逐字同语义、注释根因链与真实错误串吻合、env 展开 opts 覆盖权保留；nit = delete 形状四处出现 repo 风格优先 + 双保险纵深防御非冗余）；spec **pass**（0 must-fix / 1 partial 判定语义等价 / 5 note：显式前缀=确定性复现真实污染会话；修法 1:1 落地；可选项属票面授权；第三变量触发 subagent-runner-root.test.ts 首例 stash 实证 base 同败=既有环境敏感非本 diff 引入；超范围零）。遗留候选（归操作者）：subagent-runner-root.test.ts 环境敏感跟进微票。
