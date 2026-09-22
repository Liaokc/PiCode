# t134 progress — spawn-path bundled-SDK

目标一句话：Finder/Dock 启动的 PiCode 里会话内 spawn pi-subagent 能工作（双根因子双修复：PATH 合成 + 捆绑 SDK 0.86.1 对齐）。

- [2025-09-16] 阶段=开工。读取票面/CONTEXT/spec R21/ADR 后进入插桩定位。

- [2025-09-16] 根因取证（读码，未跑 app）：
  - PATH 断点：pi-subagents 0.70.1 `src/shared/node-executable.js` `resolveNodeExecutable()`——`process.execPath` 名不是 node（Electron/ELECTRON_RUN_AS_NODE host）时返回裸字符串 `"node"`，由 `src/runs/background/async-execution.js` `spawnRunner` `spawn(command,...)` 走 PATH 查找。GUI（Finder/Dock）启动时主进程 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`（无 nvm/homebrew node）→ host 子进程（`host-supervisor.ts` fork 时 `env:{...process.env}` 原样继承）内 pi-subagents spawn `node` ENOENT。workaround（终端带 nvm PATH 启动）即修复此链，与票面第一轮取证一致。
  - SDK 断点：pi-subagents 0.70.1 `src/watchdog/review.js` `import { createReadOnlyTools, convertToLlm } from "@earendil-works/pi-coding-agent"`；SDK 经 jiti alias（loader.js getAliases）解析到 app 捆绑 SDK。0.86.1 index 导出 createReadOnlyTools（已核 dev node_modules 0.86.1 有）；批次空跑时 app 用的是 0.85.1（npm install 未跑的缺口）→ 导入失败。修复 = 版本核验（dev node_modules + 打包产物 = 0.86.1）+ 启动自检。
  - 证据指针：~/.pi/agent/npm/node_modules/pi-subagents/src/shared/node-executable.js（全文 26 行）、src/runs/background/async-execution.js L427-510、src/watchdog/review.js L1-5；本 worktree node_modules/@earendil-works/pi-coding-agent@0.86.1 dist/index.d.ts L19。

- [2025-09-16] 因子②精确断点补强（实证）：pi-subagents 0.70.1 `src/watchdog/review.js:4`（及 permission-arbiter.js:4）`import { createInitialSystemMessage, toToolDeclaration } from "@earendil-works/pi-ai"`——两导出自 pi-ai 0.86.0 起 `dist/utils/transcript.ts` 经 index 再导出（worktree 0.86.1 dist/index.d.ts:33 `export * from "./utils/transcript.ts"`）；npm 拉 0.85.1 tarball 实证**无** utils/transcript、无该二导出 → 0.85.1 下 pi-subagents 模块加载即失败（扩展整体不加载，spawn 全然不可用，PATH 修复也救不回）。批次空跑时 app 用的 0.85.1（npm install 未跑）即此断点；dev node_modules 现已 0.86.1（pi-coding-agent 与嵌套 pi-ai 均 0.86.1，lock 实核）。
  证据指针：/tmp/pi0851-probe（0.85.1 tarball 解包，含 pi-ai 0.85.1 无 transcript 导出对照）；worktree node_modules/@earendil-works/pi-coding-agent@0.86.1 + 其嵌套 pi-ai@0.86.1。
- [2025-09-16] 机制验证（本机实验）：① 裸 PATH 下 spawn node → ENOENT；② spawn env 注入含 node 的 PATH → OK；③ Node/libuv spawn 用**option env 的 PATH**做可执行查找（非 process.env）→ 主进程注入 host fork env 即可贯通 host→runner spawn 链。④ 净化 env（env -i HOME）下 `os.userInfo().shell`（=fish 绝对路径）`-lc 'printenv PATH'` 正常产出完整登录 PATH（fish 的 `echo $PATH` 是空格分隔——printenv 才通用；bash/zsh 同验）。
- [2025-09-16] 方案定稿（票面口径）：
  ① src/shared/spawn-path.ts 纯函数（composeSpawnPath：current→login-only→probe-only 去重保序、空项丢弃、失败降级=不劣化 current）+ nvm default 别名解析纯函数；src/main/spawn-path.ts 异步初始化（登录 shell 快照 printenv PATH、5s 超时、静态探测 nvm-current//usr/local/bin//opt/homebrew/bin/~/.pi/agent/bin、缓存一次）+ hostForkEnv() 注入三处 fork（host-supervisor / auth-probe / packages-op）。
  ② src/shared/subagent-sdk-alignment.ts 纯 notice 模型（SDK<0.86.1 × pi-subagents≥0.70 → 英文提示）+ src/main/subagent-sdk-check.ts 读两端版本 → host_notice(error) 广播（复用既有契约事件，零新增 IPC）；package.mjs --verify 增打包产物内 SDK/pi-ai 版本断言；vitest 断言 dev node_modules 版本 + createReadOnlyTools/transcript 工具能力探针。
  ③ electron smoke：src/main/smoke.ts 增 PICODE_SMOKE_STAGE=t134 选择器 + 净化腿（等 PATH 合成就绪→断言 node 可解析→建会话→/run scout --bg→subagent_async_started+status.json(pid)→RPC stop 收敛）；scripts/smoke/sanitized-spawn-smoke.mjs 净化启动器（env -i 等效：HOME+裸 PATH+smoke 变量）；run-all.sh 增步。
  测试序：先落腿+启动器在未修复分支跑出双因子失败现场（PATH 断点实证）→ 落双修复 → 同条件复测转绿。
- [2025-09-16] 票 Status → claimed（worktree 副本随分支提交）。

- [2025-09-16] **插桩定位实证①（PATH 断点，净化环境现场留档）**：临时还原 pre-fix fork env（host-supervisor 裸 `...process.env`）+ 已落地的 t134 净化腿，跑 `node scripts/smoke/sanitized-spawn-smoke.mjs`（env -i 等效：HOME+`/usr/bin:/bin:/usr/sbin:/sbin`+smoke 变量）→
  - `SMOKE spawn_path_composed node v24.13.0 via 18 entries (bare launch PATH had 4)`（合成逻辑本身工作）
  - `SMOKE t134_session_created`后会话内 `/run scout … --bg` → **`[host stderr] [pi-subagents] async spawn failed: spawn node ENOENT`** → `subagent_async_started` 90s 超时 → 阶段 FAIL、launcher exit 1。
  - 断点口径：**会话 host 进程**（Electron 主进程 fork、ELECTRON_RUN_AS_NODE，execPath=Electron 二进制 → pi-subagents `resolveNodeExecutable()` 回退裸 `"node"`）在 spawn 分离 runner 时以名查 `node`，继承的 GUI 等效裸 PATH 四目录无 node → ENOENT。父会话自身照常出 thinking/tool/approval 事件（对 /run 错误结果的正常反应），子代理链死在 spawn。
  - 日志原件：/tmp/t134-prefix-run.log（15 行）；中断注入的临时改动已复原（cp 备份回写，grep 验证 hostForkEnv() 在位）。

- [2025-09-16] **修复后同条件复测（净化环境）全绿**：恢复 hostForkEnv() 注入、重建后 `node scripts/smoke/sanitized-spawn-smoke.mjs` exit 0——
  `spawn_path_composed node v24.13.0 via 18 entries (bare 4)` / `sdk_alignment sdk=0.86.1 pi-subagents=0.70.1` / `t134_async_started runId=9d599521-…` / `t134_spawn_proof state=running runner pid=28271`（分离 runner node 进程真实存在——ENOENT 断点消除）/ `t134_verdict stop ok=true state=stopping terminal=stopped runner-exited=true`（RPC stop 收敛、runner 进程退出、通道释放）。
  日志原件：/tmp/t134-postfix-run.log。
- [2025-09-16] 待办：全量 vitest + typecheck + 完整 `npm run smoke`（正常 PATH 不回归 + 套件末位净化腿）；package.mjs 产物断言为静态核（打包时跑）；票 Comments 模板与终态。

- [2025-09-16] **Round K（host-contract ticket-101 stop 段）零交集留档（stash 基线 A/B）**：
  - 现象：`npm run smoke` 死在 stage 2 host contract 的 Round K——"the live stop must be accepted with state stopping" 超时（pi-subagents RPC 不应答；round H available=false / round J steer 亦超时但被该段期望容忍）。
  - 根因（本会话环境，非代码）：我的 shell 泄漏 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT=<全局 nvm SDK 路径>`（本 subagent 会话继承）——host 的 ensureSubagentRunnerPackageRoot 尊重"operator override"不覆盖 → pi-subagents RPC 链死。`env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 后同 smoke 过 Round K（进入后续 model 轮，后被我方 bash 超时截断，非 smoke 失败）；净化启动器（最小 env，不含泄漏变量）全绿亦旁证。
  - **stash 基线 A/B**：`git stash push -u`（纯 main be105d9）→ 同条件重跑 → **基线同死 Round K**（同一超时报错，/tmp/t134-baseline-roundK.log）→ 零交集成立，按批次口径留档不追；stash 已 pop 复原（16 文件在位，票 Status=claimed 保持）。
  - 处置：后续 smoke 一律 `env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 前缀（vitest 同理，任务纪律既定）。

- [2026-09-22] Round K 修正与 Round A：suite 重试 3 次——①死 Round A（abort 后 agent_end 90s 超时，偶发，t131 已留档族）；②过 A 后死 Round K（同前）。**误判修正**：早期认为 env 泄漏是 Round K 根因——env -u 复跑 Round K 仍死（早期"env -u 过 K"的 rerun2 实际未跑到 K 即被我方 bash 超时截断）。结论：Round A/K 均为 t131 先例的批次级 flaky 族，基线（纯 main）同死，零交集；泄漏变量只影响 vitest。处置：其余 smoke 段单跑取证；票 Comments 已改正确。

- [2026-09-22] electron smoke（正常 PATH 不退化取证）：带 diff 跑 `npm run smoke:electron` → 死在 **ticket-117 段**（"the cjk draft must overflow the input for an internal scroll (scrollH 146, clientH 146)"）——CDP IME 组段、焦点敏感（t117 本身在 t129/117/125/130 焦点经验名单里）。**stash 基线 A/B：纯 main 同死 117（同一条断言同参数）→ 零交集成立**。117 之前的全部段绿（empty_state 全套、mcp、模型菜单、thinking、access、terminal-focus-132、composer-typing-116、117 prefill viewport）＝正常 PATH 下 app 全链路（含我注入的合成 PATH fork 链）不退化的实证。待跑：pty / usage / interop 三段。

- [2026-09-22] 收口：vitest 2153/2153 绿（env -u 前缀）、typecheck 绿、pty/usage/interop 全绿、净化启动器修前 ENOENT 对照修后全链（/tmp/t134-prefix-run.log ↔ /tmp/t134-postfix-run.log）、electron smoke 117 前全段绿（117 与 host-contract A/K 均基线同死，零交集留档于票 Comments）。分支 t134-spawn-path 提交 **856b9550**（实现+测试+票 Comments/验收模板）+ **973cc4e**（Status → ready-for-human 翻转，票内记实现 tip）。未合并未推送（纪律）。剩余：操作者 Finder/Dock 手工验收（模板在票 Comments）。
