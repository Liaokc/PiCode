# 144: forkHost 环境标记剥离——smoke:host 直 fork 路径的 PI_SUBAGENT_CHILD 泄漏口

**Status:** Todo

**What to build:** 票 142 R2 修复了 electron 侧（hostForkEnv() 剥离 PI_SUBAGENT_CHILD/PI_SUBAGENTS_HERDR_BRIDGE + electron-smoke.mjs/run-all.sh 启动侧净化），但 `scripts/smoke/host-contract-smoke.mjs` 的 forkHost()（408-415）直 fork host 时不剥标记。从 subagent 会话驱动的 smoke:host 跑（worker 会话实测携带 PI_SUBAGENT_CHILD=1）→ host 内 pi-subagents 按契约拒注册 → Round K（ticket-101 subagent 段）死 "the stop request timed out (pi-subagents did not answer)"（143 实现工跑 1 实证；env -u 三变量后全套过）。

**修法**：forkHost() 的 spawn env 剥离 PI_SUBAGENT_CHILD 与 PI_SUBAGENTS_HERDR_BRIDGE（与 spawn-path.ts hostForkEnv 同语义：host fork 是顶层进程永非 child）；可选 run-all.sh 的 host-contract 步启动侧同步净化。

## Acceptance

- [ ] 从携带 PI_SUBAGENT_CHILD=1 的会话驱动 `npm run smoke:host` 全套 PASS exit 0（不再需要 env -u 前置）
- [ ] 干净 env 跑照常绿；vitest（env -u）全绿；eslint touched

**Red lines:** 只动 harness；产品/shared 零改动。

**Blocked by:** 无.
