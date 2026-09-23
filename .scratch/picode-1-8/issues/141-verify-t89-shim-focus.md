# 141: package:verify 彩票终结——t89 OAuth 垫片被 hostForkEnv 冻结 PATH 吞掉（t134 回归）+ 焦点腿缺窗口焦点前置保险

**Status:** ready-for-agent

## What to build

发布门 `npm run package:verify` 连续 6 跑死在三个点（t89 ×2、t105 ×2、t132 ×1、t124 已另修）。本票根因定位并修复其中**确定性回归（t89）**与**高频环境死点（t132/t105 leg1 的焦点前置缺失）**，让打包验证回到「安静窗口可全绿」的可达状态。

## 取证（6 路打包验证，2026-09-23）

| 跑 | 死点 | 判定 |
|----|------|------|
| 1 | t124 usage fixture 断言 | harness 缺陷已修（30eb3a1：openLaunchArgs 漏配 `PICODE_FAKE_USAGE=1`） |
| 2 | t89 OAuth 外开 `log=[]` | **确定性回归**（本票 R1） |
| 3 | t105 ⌘J open 未聚焦 | 环境焦点族（本票 R2 补前置保险） |
| 4 | t132 boot ⌘J 未聚焦 | 同上 |
| 5 | t105 ⌘J open 未聚焦 | 同上 |
| 6 | t89 OAuth 外开 `log=[]` | **确定性回归**（R1） |

t89 到达即死（打包 2/2、近期 dev 跑同死）；t132/t105 过与不过交替（真环境彩票）。v1.7.0 时代 package:verify 曾整过 t89——回归窗口锁定在 1.8 批。

## Root cause R1（确定性）：hostForkEnv 冻结 PATH 吞掉运行时注入

机制链（file:line 全录）：

1. `src/main/smoke.ts:12998`（t89 段开始处）把垫片目录前置进主进程 `process.env['PATH']`——垫片 `open` 脚本记录一切外开 URL 到 open.log，断言靠它取证。
2. `src/main/spawn-path.ts:161` `hostForkEnv()` = `{ ...process.env, ELECTRON_RUN_AS_NODE:'1', PATH: getSpawnPath() }`——**PATH 被 getSpawnPath() 覆盖**。
3. `getSpawnPath()` = `composedCache ?? process.env.PATH`，而 `composedCache` 在 `initSpawnPath()`（app 启动）一次性冻结（login-shell 快照 + 静态探针与**当时**的 PATH 合成）。
4. 于是 t89 段新建会话的 host fork（`src/main/host-supervisor.ts:174` `env: hostForkEnv()`）拿到的是**启动时冻结的 PATH**——垫片目录不在其中。
5. host 内 MCP 适配器（`~/.pi/agent/npm/node_modules/pi-mcp-adapter/dist/utils.js` `execOpen` → `pi.exec("open", [target])`，SDK `dist/core/exec.js` spawn 不带 env = 继承 host 的 PATH）解析到**真实 `/usr/bin/open`**。
6. 真实 open 拉起默认浏览器访问授权 URL → mock 服务器收到 `GET /authorize`（跑 2/6 日志均有）→ OAuth 端到端完成（`mcp_auth_completed`、状态「OAuth authentication successful」）——**但垫片 open.log 永远为空** → `ticket-89 stage: the authorize URL was never opened externally (log=[])` 必死。

回归引入点：**票 134**（1.8 批）给 host fork 注入组合 PATH 时以缓存整体覆盖了 PATH，丢掉了默认 spawn 的「fork 时点活 env」语义。v1.7.0 之前 host fork 直接继承 `process.env`，垫片生效。

误分类教训：139 轮的 stash 基线 A/B「同死留档」对比的是**已含 t134 的基线**——「预存于 139」为真，但真正起源（t134）被漏掉，被归入「环境竞态族不追」。t89 从来不是竞态，是确定性回归。

## Root cause R2（高频环境死点）：t132 / t105 leg1 焦点断言缺窗口焦点前置

- `src/main/smoke.ts:1463`（t132 boot 腿 inShell 探针）与 `:4166-4170`（t105 leg 1：pressJ → ensureShellFocus）直接断言 `document.activeElement` 是 xterm textarea，**没有先确保窗口持有系统焦点**。
- Chromium 语义：窗口失活时被聚焦元素失焦、`activeElement` 变 body——产品行为正确（⌘J 的 armed focus 已落地）断言也会失败；macOS 15 在操作者于他处输入时还会拒绝焦点窃取（既有注记，smoke.ts:2113）。
- harness 已有成熟保险模式：t44 段（smoke.ts:2107-2121：`win.show()/win.focus()/app.focus({steal:true})` + `document.hasFocus()` ≤10s 轮询 + 每 tick 重请求）与 t105 leg 2（4175-4181 + 每次击键前 re-steal）。**缺的只是把保险补到两处裸奔腿上**——断言本身一字不改（前置条件修复，非放宽）。

## Fix design

### R1：spawn-path.ts 改为「缓存贵的事实，读取时活组合」

- 缓存对象从「合成结果字符串」改为**事实** `{ loginShellPath: string | undefined, probePaths: string[] }`（login-shell 快照与磁盘探针是贵操作，仍一次缓存）。
- `getSpawnPath()`：事实未落地 → 当前 `process.env['PATH']`（现回退语义不变）；已落地 → `composeSpawnPath({ currentPath: process.env['PATH'], loginShellPath, probePaths })` **每次读取时用活 currentPath 重组**。
- `hostForkEnv()` / `whenSpawnPathReady()` 签名与消费方（host-supervisor / packages-service / probe-runner / smoke t134-sanitized 段）零改动；t134 的 GUI 富 PATH 语义与「current 恒最前、不降级」次序契约（`src/shared/spawn-path.ts` composeSpawnPath）原样保留——运行时注入的垫片目录恒在最前。
- 效果：任何时点对主进程 PATH 的追加都会到达之后 fork 的 host（恢复默认 spawn 继承语义），t89 垫片重新可观测。

### R2：smoke.ts 抽 `ensureWindowFocused(label)` helper 并补三处

- helper = t44 内联块原样抽取（show/focus/app.focus(steal) + hasFocus ≤10s 轮询逐 tick 重请求 + 未得即 fail(label)），定义在 `const win = smokeWin` 之后（fail/app/win 均在作用域）。
- 调用点：① t132 armed press 前 + t132 inShell 探针前；② t105 leg 1 pressJ 前；③ t44 内联块重构成 helper 调用（行为零变化）。
- t105 leg 2 的逐击键 re-steal 与 t135 rider 原样不动。

## Tests

- 新增 `tests/main/spawn-path-live.test.ts`：`initSpawnPath()` + `await whenSpawnPathReady()` 后突变 `process.env['PATH']`（前置哨兵目录）→ `getSpawnPath()` 与 `hostForkEnv()['PATH']` 均以哨兵开头且包含原 PATH 条目（次序保持）；事实未落地时 `getSpawnPath()` === 当前 PATH（回退语义）。spawn-path.ts 无 electron 依赖，可直接 import。
- 纯模型测试（tests/shared/spawn-path.test.ts）不动——composeSpawnPath 未改。

## Acceptance

- [ ] R1：新测试过；hostForkEnv 反映运行时 PATH 注入；t134 no-degradation 次序契约不变（sanitized 段 `composed ≠ bare` 断言原样可过）
- [ ] R2：三处调用点就位；断言文本与探针零改动；t44 行为等价
- [ ] vitest 全绿（env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT）/ typecheck / eslint（touched files）
- [ ] 工作树 dev electron smoke（`node scripts/smoke/electron-smoke.mjs`，先 ps 自查）跑到并**过 t89 段**（`mcp_oauth_autocomplete_ok` 哨兵在日志中出现）——R1 直接证据；若前置族先死，重试至多 2 次并在报告披露
- [ ] 合并后 main 上安静窗口 `npm run package:verify` 全绿（发布门，操作者在场时段不强行）

## Red lines

- 产品行为零改动：R1 是 env 传递语义修复（恢复 fork 时点活 PATH + t134 增量合成），R2 纯 harness 前置保险。
- shared 契约零改动；不 push、不打 tag、不删工区。
- UI/文案无涉。

**Blocked by:** 无.
