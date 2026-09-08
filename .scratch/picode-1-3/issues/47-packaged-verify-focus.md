# 47: packaged-verify 焦点修复——打包冒烟的 ticket-44 阶段拿不到窗口焦点

**What to build:** 修复 `npm run package:verify` 的确定性失败（两次复现，同一断点）：打包版（release/PiCode-darwin-arm64/PiCode.app）冒烟跑到 ticket-44 的 user_copy 阶段必挂 `the window never took focus for the real-clipboard click`。该阶段在 `src/main/smoke.ts` ~L478 已做全套激活手段（`win.show()` + `win.focus()` + `app.focus({ steal: true })` + 10s 轮询 `document.hasFocus()`），打包环境全数无效；dev 环境（`electron .`，smoke 六阶段 ALL GREEN）同阶段通过。

**已查明的诊断事实（合并会话侦察，只读）：**
- 非应用功能回归：单元 1024/1024、dev smoke 全绿（含 user_copy 真剪贴板断言）、44 合并时验证链全绿。回归面 = **打包冒烟 harness**。
- 打包 app 由 `scripts/package.mjs` --verify 以 **spawn 二进制直启**（`Contents/MacOS/PiCode` + `PICODE_SMOKE=1` env，见 package.mjs L74），**未走 LaunchServices**。
- Info.plist 无 LSUIElement；bundle id `app.picode.desktop`。
- 根因候选：本机 macOS 对**后台直启（非 LaunchServices）app** 的激活策略收紧——`app.focus({ steal: true })`（即 NSApp activateIgnoringOtherApps）对直启 app 不再生效；dev 的 com.github.Electron 同为直启却能激活，需实测分辨是 bundle 身份还是启动方式所致。

**修法方向（会话自行甄别，按性价比排序）：**
1. **启动方式改 LaunchServices**（首选，纯 harness 改动）：`scripts/package.mjs` --verify 分支从 spawn 二进制改为 `open <app路径> --env PICODE_SMOKE=1 --env PICODE_SESSION_DIR=...`（`open` 走 LaunchServices，app 正常激活，`app.focus({steal:true})` 恢复效力）。若 `--env` 在本机 macOS 不可用，可改为 CLI 参数（`--smoke` arg）或让 package.mjs 写一个临时 env 文件由 app 读取——注意**不得改动产品代码语义**。
2. 若 1 实测仍不激活：打包冒烟该阶段**降级为 stub 剪贴板断言**（visual harness 已有 stub 先例），同时在 dev smoke 保留真剪贴板断言不弱化；代码注释记录 macOS 策略原因。
3. 禁止方向：不许弱化 dev 冒烟断言；不许动产品 UI/IPC 代码（copy 行本身工作正常）；不许动 /Applications 里的已安装 app。

**Blocked by:** None（发版流程唯一 blocker，操作者已批准开票）。

**Status:** resolved

- [x] package:verify 连跑两次全绿 exit 0（打包版 ticket-44 阶段含真剪贴板断言通过，或按方向 2 有记录的降级通过）
- [x] npm run smoke 六阶段 ALL GREEN（dev 断言不弱化）
- [x] typecheck / lint / vitest 全绿（1024+）
- [x] 改动范围仅：scripts/package.mjs（及必要的 smoke.ts 焦点逻辑微调）； CONTEXT.md 不涉及
- [x] 全英文文案；Comments 记录根因结论（哪个方向生效 + 证据）

## Comments

- 2026-09-08 (requirements intake, 合并会话): 发版 v1.3.0 时 package:verify 首次暴露——44 的 user_copy 是史上第一个需要真实窗口焦点的 packaged-verify 阶段，v1.2.0 发版时此路径不存在。诊断与两个方向见上。波次外插票（W6，单人单票），完工即重跑发版链。
- 2026-09-08 (implementation, t47): **方向 1 生效（LaunchServices）**，方向 2 未采用、零降级。commit `e98b9fb`。根因链与证据：
  1. **直接 spawn 的打包 app 在本机 macOS 15.6.1 上拿不到 key focus**（票面诊断属实）：spawn 二进制 + PICODE_SMOKE=1 时 `show/focus/app.focus({steal:true})` 全部无效，`document.hasFocus()` 永远 false。
  2. **修法**：`scripts/package.mjs` --verify 改用 `open`（LaunchServices）启动打包 app：`open -W --stdout/--stderr --env PICODE_SMOKE=1 --env PICODE_SESSION_DIR=<tmp>`。app 正常激活，焦点轮询通过，ticket-44 真剪贴板断言原样通过。
  3. **`open` 的两个坑**（实测证据，记录在 scripts/package-verify-launch.ts）：`open -W` **不透传 app 退出码**（探针：子进程 exit 3、open 仍 exit 0），故 pass/fail 改读 smoke 自身日志哨兵（stdout 含 `SMOKE done`＝成功；stderr 首条 `SMOKE FAIL ...`＝失败原因）；LaunchServices 按 bundle id 认 app，若已有 PiCode 实例在跑会被激活而非新 build（--env 被丢弃）——verify 启动前 pgrep 预检，直接报错退出。
  4. **smoke.ts 两处 harness 稳健性微调（仅 PICODE_SMOKE=1 生效，断言零弱化）**：withWindow 对 smoke 窗口 `setBackgroundThrottling(false)`——被遮挡窗口的合成器动画会被冻结，45 的 opacity 探针会卡在起始值（ticket-45 已在 visual harness 记录同一根因）；每阶段用 44 的机制重新激活窗口（show + focus + app.focus({steal:true}) + key 轮询），操作者中途切走窗口不再让 REAL-input hover/opacity 阶段闪挂。
  5. **验证门实测**：package:verify 连续 3 次 exit 0（含真剪贴板断言）；npm run smoke 六阶段 ALL GREEN、会话 hygiene 通过（真实 ~/.pi 库 97 个文件不变）；typecheck / lint / vitest 1030（+6 个新单测，覆盖 open argv 构造与日志 verdict 逻辑）全绿。
- 2026-09-08 (operator hint): 发版链可重跑。merge：`bash scripts/merge-ticket.sh 47`（实现会话不自行 merge）。
- 2026-09-08 (merge): merged as **ab798b1**（--no-ff，4 文件 +267/−18，实现 e98b9fb 单提交重放，tracker 判重丢弃）。验收口径：操作者验收。冲突处置：零冲突（零代差）。根因结论（会话 Comments 已记）：**直启 spawn 永远赢不了焦点，LaunchServices 启动修复**——走票面方向 1，package.mjs 改经 open 启动打包 app（新 package-verify-launch.ts 模块 + 75 行测试），smoke.ts 仅焦点逻辑微调；产品 renderer/shared 零接触 ✓。main 终态审计：typecheck + vitest **1030/1030**（77 文件，+6）。解锁：发版链恢复（smoke + package:verify 复跑 → tag v1.3.0）。
