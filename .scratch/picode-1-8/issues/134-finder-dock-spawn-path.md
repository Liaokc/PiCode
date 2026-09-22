# 134: Finder/Dock 启动也能 spawn subagent——PATH 合成 + 捆绑 SDK 对齐（本批最后实现）

**What to build:** 从 Finder/Dock 正常启动的 PiCode 里，会话内 spawn pi-subagent 能工作。**双根因子，双修复**——全部落在 `~/PiCode` 源码、随 v1.8.0 上线（**不碰已安装/已发版的 app bundle**）：

①**PATH 合成**：主进程启动早期（缓存一次、超时与失败降级）合成子进程 spawn 用的 PATH——`$SHELL -lc 'echo $PATH'` 登录 shell 快照 + 静态探测常见 node 安装点（`~/.nvm/versions/node/*/bin` 当前版本、`/usr/local/bin`、`/opt/homebrew/bin`、`~/.pi/agent/bin`），注入所有需要 PATH 的子 spawn（subagent 子进程；会话 host 如涉及同样注入）。**LSEnvironment 否决**（PATH 机器相关，不能烧进通用 bundle）；探测不阻塞窗口就绪（异步初始化，票内裁量）。

②**捆绑 SDK 对齐核验**：spawn 链依赖捆绑 SDK 的能力面——实测瓶颈 = app 捆绑 pi-ai 0.85.1 **没有 transcript 工具导出（0.86.1 才有）**，pi-subagents 0.70.1 的 review.js 需要它。修复 = 确保 app 实际捆绑的 SDK/pi-ai 为 0.86.1（package.json pin 已 0.86.1；npm install 同步 node_modules/lock；打包链核验产物内版本）+ 启动期版本自检（票内裁量：SDK < 0.86.1 与 pi-subagents ≥ 0.70 组合时如实提示，不静默失败）。

**测试方法（操作者指定）：** 用「**从 Finder/Dock 启动 PiCode → 其中的会话 spawn pi-subagent**」作为测试全流程：①**定位** = Finder/Dock（或净化环境等效：`env -i HOME=… PATH=/usr/bin:/bin:/usr/sbin:/sbin` 直启二进制）启动 → 应用内会话 spawn 失败现场 + 插桩两根因子分别实证（PATH 断点 + SDK 导出缺失断点）；②**修复后同条件复测** → spawn 成功。可自动化部分进 electron smoke（sanitized-env 启动 + 应用内 spawn 腿）；Finder/Dock 实启最终确认留操作者（验收记录模板：启动方式 / spawn 结果 / 版本事实三要素）。

**实现时点：本批最后实现（116–133 全部合并后）**——验证要带着批次全部修复启动 app；批次运行自身（Pi Agent 主会话）不依赖本票。

**背景（取证）：** 两轮自治批次空跑实证。第一轮定位 PATH 因子（GUI 启动不继承 shell PATH；workaround = 终端带 nvm PATH 启动即通）。第二轮（PATH workaround 已生效仍失败）深挖出第二因子——**app 捆绑 pi-ai 0.85.1 缺 transcript 工具导出，pi-subagents 0.70.1 的 review.js 需要它（0.86.1 才有）**。node_modules 实装 0.85.1 = 批次开场已记录的「npm install 未跑」缺口——本票把「捆绑版本正确」从环境前提升格为本票验收项。操作者原话：「不是已经发版的代码，而是 ~/PiCode 内部的相关代码，这个修复在 v1.8.0 上线」。

**Blocked by:** 116–133 全部合并（本批最后实现）.

**Status:** ready-for-human (2026-09-22, agent; branch t134-spawn-path @ 856b9550)

## Acceptance

- [x] **插桩定位 = 第一验收项，双因子分别实证**：Finder/Dock（或净化环境等效）启动的实例里——PATH 断点（哪个进程找哪个可执行失败）+ SDK 导出缺失断点（pi-subagents review.js 需要的导出在捆绑版本缺席）留档
- [x] Seam-1：PATH 合成纯函数表驱动（登录 shell 快照 / 静态探测点 / 去重与顺序 / 失败降级 / 已有良好 PATH 时不劣化）
- [x] electron smoke：sanitized-env 启动 + 应用内 spawn subagent 成功腿；正常 PATH 启动不回归
- [x] 捆绑版本核验：dev node_modules 与打包产物内 SDK/pi-ai = 0.86.1（断言或探针）；启动自检如实提示（若做，不静默失败）
- [x] 手工验收记录模板：操作者 Finder/Dock 实启 → 应用内 spawn 成功（修复以新启动实例为限——运行中实例不热更，边界记 Comments）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 6)：P28 定稿 R21（PATH 因子，单因子口径）。
- 2026-09-22 (Round 7 修订)：第二空跑（workaround 已生效仍失败）实证第二根因子——捆绑 pi-ai 0.85.1 缺 transcript 导出、pi-subagents 0.70.1 review.js 需要。操作者裁决三项：①134 移至**批次最后实现**；②测试 = Finder/Dock 实启 + 应用内 spawn 全流程；③修复落 `~/PiCode` 源码、随 v1.8.0 上线（不碰已发版 bundle）。原文保留第一轮口径备查：PATH 合成 + LSEnvironment 否决 + 复现纪律（workaround 实例 spawn 可用是预期现象）——全部继续有效。
- 2026-09-22 (implementation, t134-spawn-path)：双修复落地（全部本仓库源码，v1.8.0 随版）：
  ① **PATH 合成**——`src/shared/spawn-path.ts`（纯模型：composeSpawnPath current→login-only→probe-only 去重保序、空槽丢弃、失败降级不劣化 current；resolveNvmVersion 别名解析）+ `src/main/spawn-path.ts`（启动早期异步合成一次：`<shell> -lc 'printenv PATH'` 登录 shell 快照——printenv 而非 echo，fish 的 $PATH 是空格分隔列表；5s 超时；静态探测 nvm 当前版本 bin//usr/local/bin//opt/homebrew/bin/~/.pi/agent/bin，均须实际存在；shell 取 SHELL env 回退 os.userInfo().shell 使净化环境也能解析）+ `hostForkEnv()` 注入全部三处 host 族 fork（host-supervisor / auth-probe / packages-op）。LSEnvironment 依裁决不做。
  ② **捆绑 SDK 对齐**——`src/shared/subagent-sdk-alignment.ts`（纯 notice 模型：SDK<0.86.1 × pi-subagents≥0.70 → 英文 toast 文案）+ `src/main/subagent-sdk-check.ts`（读 app 捆绑 SDK 与 ~/.pi/agent npm pi-subagents 两端版本，ADR-0003 不破——纯 package.json 读取）+ index.ts 启动自检（坏组合经既有 host_notice 契约事件广播 toast + console，绝不静默）；`scripts/package.mjs` 打包即断言产物内 SDK=pin 且 pi-ai≥0.86.1；`tests/main/bundled-sdk-versions.test.ts` 断言 dev node_modules 两版本 + 能力探针（SDK 导出 createReadOnlyTools/convertToLlm、pi-ai dist/utils/transcript 导出 createInitialSystemMessage/toToolDeclaration——版本号之外的能力面实证）。
  ③ **electron smoke**——`src/main/smoke.ts` 增 PICODE_SMOKE_STAGE=t134-sanitized 选择器 + 净化腿（等 PATH 合成就绪→断言合成 PATH 增量且 node 可解析→断言 SDK 对齐事实→建会话→`/run scout … --bg`→subagent_async_started→status.json 带活 pid（分离 runner 进程真实存在）→RPC stop 收敛 + runner 进程退出）；`scripts/smoke/sanitized-spawn-smoke.mjs` 净化启动器（env -i 等效：HOME+四系统目录+smoke 变量；electron 绝对路径在净化前解析）；run-all.sh 增第 7 步。

- 2026-09-22 (插桩取证留档，第一验收项)：
  - **PATH 断点（净化环境现场）**：pre-fix（临时还原裸 fork env）跑净化启动器 → `[host stderr] [pi-subagents] async spawn failed: spawn node ENOENT` → subagent_async_started 90s 超时。断点口径：**会话 host 进程**（Electron fork、ELECTRON_RUN_AS_NODE，execPath=Electron 二进制 → pi-subagents `src/shared/node-executable.js` resolveNodeExecutable() 回退裸 `"node"`）spawn 分离 runner 时按名查 node，GUI 等效裸 PATH（/usr/bin:/bin:/usr/sbin:/sbin）无 node → ENOENT。机制旁证（本机实验）：libuv spawn 以 **option env 的 PATH** 做可执行查找 → 注入 host fork env 即贯通全链。
  - **SDK 导出缺失断点**：pi-subagents 0.70.1 `src/watchdog/review.js:4`（及 permission-arbiter.js:4）`import { createInitialSystemMessage, toToolDeclaration } from "@earendil-works/pi-ai"`——该二导出自 pi-ai 0.86.0 起 `dist/utils/transcript.ts` 经 index 再导出（0.86.1 dist/index.d.ts:33）；npm 拉 0.85.1 tarball 实证无此文件无此导出 → 0.85.1 下 pi-subagents 模块加载即失败、扩展整体不加载（PATH 修好也救不回）——与批次第二轮空跑（PATH workaround 已生效仍失败）一致。
  - **修复后同条件复测（净化环境）全绿**：`spawn_path_composed node v24.13.0 via 18 entries (bare 4)` / `sdk_alignment sdk=0.86.1 pi-subagents=0.70.1` / `t134_async_started runId=9d599521…` / `t134_spawn_proof state=running runner pid=28271` / `t134_verdict stop ok=true state=stopping terminal=stopped runner-exited=true`。

- 2026-09-22 (smoke:host Round A/K 零交集留档，stash 基线 A/B)：`npm run smoke` 反复死在 host-contract——Round K（ticket-101 live stop 超时，pi-subagents RPC 不应答）与 Round A（abort 后 agent_end 90s 超时，偶发两次）。**stash 基线（纯 main be105d9）同条件 Round K 同死**；Round A 在无 diff 干涉下亦有通过/超时两种结局（纯模型 abort 段波动）——两段均 t131 已留档的批次级 flaky 族（A/K），与本票 diff 零交集（host-contract smoke 只跑 out/main/host.js，本票未触 host/桥/契约面；结构上不可能被本 diff 改变）。修正一处早期误判：曾以为会话泄漏的 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 是 Round K 根因——后续 env -u 复跑 Round K 仍死，该泄漏只影响 vitest 的 subagent-runner-root 假失败（任务纪律既定），Round K 与其无关。处置：单跑其余各段取证（见下条），A/K 按批次口径留档不追。

- 2026-09-22 (self-review，B 轴 fallback 自行评审)：Standards 轴——新模块均单用途小文件、票号注释、表驱动测试、UI 文案英文、无占位/无死代码（spawn-path 纯模型与主进程初始化分离，nvm 别名解析纯函数化）；Spec 轴——Acceptance 六条逐一对照通过（见上勾选与取证留档）。主 Agent 独立双轴评审待派。

- 2026-09-22 (边界与操作者手工验收)：**修复以新启动实例为限**——运行中实例不热更（PATH 合成在主进程启动早期缓存一次；SDK 版本是捆绑事实），升级/换构建后须退出重开。手工验收记录模板（三要素）：
  1. **启动方式**：☐ Finder 双击 PiCode.app ☐ Dock 点击（记录启动时间与方式：____）
  2. **spawn 结果**：任一会话发送 `/run scout Reply with exactly: PC134OK --bg` → Subagents 侧板出现 Running 行、片刻后 Completed（结果一行预览含 PC134OK）；或让 agent 自然调用 subagent 工具（记录 runId/结果：____）
  3. **版本事实**：启动后无 "Subagents cannot start" 提示（版本自检通过）；可选核验 `cat <PiCode.app>/Contents/Resources/app/node_modules/@earendil-works/pi-coding-agent/package.json | grep version` → 0.86.1（记录：____）
- 2026-09-22 (实施完成，转人工)：分支 `t134-spawn-path` 实施提交 **856b9550**（16 文件：12 源/脚本 + 3 测试 + 票文件；vitest 2153/2153 绿、typecheck 绿、净化启动器全绿（/tmp/t134-prefix-run.log 修前 ENOENT 对照 /tmp/t134-postfix-run.log 修后全链）、pty/usage/interop 绿、electron smoke 117 前全段绿且 117 与 host-contract A/K 均为基线同死的既有 flaky 族零交集留档）。待操作者 Finder/Dock 手工验收（模板见上条）。
- 2026-09-22 (评审修复轮，票面补注)：**ps 自查声明**——每轮 dev app / electron smoke 启动前均做过 `ps aux` 宽 pattern 自查（electron / PICODE / npm run smoke 等 pattern），发现他人 dev-app/受控进程即等待清窗后再起（本票全程 dev-app 串行纪律未见违例）；留档见 work-notes t134-progress.md 各轮记录。**0.85.1 探针工件指针**——/tmp/pi0851-probe/（earendil-works-pi-ai-0.85.1.tgz + pi-coding-agent-0.85.1.tgz 原始 tarball 与解包树）实测：dist/utils/ 无 transcript 文件、index.d.ts 0 处 createInitialSystemMessage/toToolDeclaration 再导出；对照本仓 dev 捆绑（pi-coding-agent 0.86.1 内嵌 pi-ai 0.86.1）dist/utils/transcript.js 在位（tests/main/bundled-sdk-versions.test.ts 能力探针断言同事实）。
