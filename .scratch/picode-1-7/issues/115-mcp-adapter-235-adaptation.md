# 115: pi-mcp-adapter 2.35.0 适配——消费面重验

**What to build:** pi-mcp-adapter 已更新 **2.34.0 → 2.35.0**（本机 09-21 就位）。在 2.35.0 上**重验 89/96/110 的全部消费面**：①状态快照事件（`MCP_STATUS_EVENT` 形状：servers[].name/status/toolCount/disabled + totalTools/connectedCount）实测对照 96 的投影消费；②写入语义实测（disabled 旗标写 `.pi/mcp.json`、增改删写 setup 目标层——2.35 的 config 写入改为 symlink 原子替换，验证文件落点/内容不漂移）；③OAuth 流实测（浏览器回调 + 手动粘贴兜底——2.35 修复了 OAuth 重连可靠性，属有利变化）；④110 的双端矩阵在 2.35.0 上复跑。**漂移即修、不漂移留档确认**；不新增功能面（2.35 新能力 Jev/MCP Tasks/`/mcp edit`/runtime-only approval 的呈现 = 观察项不立项）。

**背景（取证，intake 交叉核对 2.35.0 changelog × PiCode 消费面）：** 核心消费面**无 breaking**——状态快照（README Runtime status snapshots 节原文在册：六态 + toolCount/directToolCount/disabled + 计数）、配置层级与写目标（「/mcp setup write targets … unchanged」原文在册）、OAuth 回调流（/mcp-auth + localhost callback + 手动粘贴）全在位。2.35 变更 = 新能力 + 修复（CJK 工具搜索、structuredContent 保留、config 写入 symlink 原子替换）+ Pi 0.86 peer 覆盖。

**Blocked by:** 96（MCP 状态投影——重验对象是其交付面）.

**Status:** ready-for-human

## Acceptance

- [x] 消费面重验清单留档：状态快照事件形状 / 写目标语义（disabled 旗标 + 增改删落盘层）/ OAuth 流 × 2.35.0 实测（89/96/110 既有 electron smoke 全绿即证）——逐项「确认无漂移」或「漂移 + 修复 sha」（见 Comments 取证链）
- [x] 若有漂移：修复 + 注明 2.35.0 对应 CHANGELOG 条目；无漂移：票内明确记录「无漂移」结论（② 写者 symlink 保真漂移已修：realpath 穿透 + mode 保留，对应 2.35.0 CHANGELOG「Config writes now preserve resolvable existing symlinks by atomically replacing their targets」#597；①③④ 无漂移）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

### 2026-09-21 实现 + 消费面重验（分支 t115-mcp-235，基座 main 5b7b0de rebase）

**取证方法**：2.35.0 CHANGELOG × PiCode 消费面源码级交叉核对（adapter `types.ts` 常量 / `mcp-status.ts` 快照构建 / `config.ts writeConfigText` / `index.ts` deferSessionRuntime 分支 / `mcp-auth-flow` 面貌），再以本机真实 2.35.0（`~/.pi/agent/npm/node_modules/pi-mcp-adapter`，smoke 经 `seedSandboxPackage` symlink 进沙箱）跑全套既有 smoke。

**重验清单（逐项）**：

1. **状态快照事件形状 — 确认无漂移**：
   - `MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1"`、`MCP_STATUS_SNAPSHOT_VERSION = 1` 原样（types.ts）——96 的镜像 pin 无需动。
   - 快照字段族原样：servers[].name/status/toolCount/directToolCount/disabled（+resourceCount?/failedAgoSeconds?），listenState/catalogStale 仍是 adapter 内部字段（`createMcpStatusSnapshot` 与 `src/shared/mcp-status.ts` 逐字段对照）；六态词汇原样。
   - 2.35 #586（cache-backed deferred startup 的 footer 恢复）：deferred 快路径仍**只设 TUI footer、不发快照**（index.ts `session_start` 的 `deferSessionRuntime` 分支无 publish）——票 96 Round I 取证在 2.35.0 依旧成立；`updateStatusBar` 改为先 publish 快照再更新 footer = 快照频率变高、形状不变，per-session last-wins store 无感。
   - **实测**：host-contract smoke Round I 全绿——`SMOKE ticket-96 mcp_status ok (version 1, 2 servers, lazy=not-connected, off=disabled)`，真实 2.35.0 快照 JSON 与 v1 契约逐字段一致。
2. **写目标语义 — 一处漂移，已修**：
   - 落点无漂移：disabled 旗标 → `<cwd>/.pi/mcp.json`（`writeProjectServerDisabledOverride` → `getProjectPiConfigPath` 原样）；增改删 → setup 两目标（README 原文「/mcp setup write targets … unchanged」+ config.ts 源码核对）；`deriveDisabledFlagWrite` 镜像（含 legacy `mcp-servers` 键保留、enable 显式 false 语义）与 2.35 源码逐行一致。
   - 内容无漂移：`JSON.stringify(raw, null, 2)` + 尾换行原样。
   - **漂移**：2.35 `writeConfigText` 新增 `realpathSync` 解析 + 文件 mode 保留（#597）——存在 symlink 别名的 canonical 配置文件上，adapter 写穿透到链接目标、别名存活；PiCode 的 `writeRawDoc` 原样 temp+rename 会把别名替换成普通文件（操作员 dotfiles 场景别名静默断裂）。**修**：`writeRawDoc` 对存在文件先 realpath 穿透 + mode 保留（缺失文件按字面路径创建，返回路径保持 canonical），TDD 两条新测试（symlink 存活 + 落目标 / mode 跨原子替换保留），21/21 绿。**修复 sha：e6c02a4**（+ review 采纳跟进 commit，见下）。
3. **OAuth 流 — 确认无漂移（有利变化）**：`/mcp-auth <server>` 命令、ui.notify 终态、手动粘贴 `ui.input` 兑底形状 2.35 未动；2.35 修复「OAuth-enabled MCP servers now reconnect reliably after explicit OAuth, stored-token, and 401 authentication paths」（PR #624）= 有利变化，正落在 96 活更新断言路径。**实测**：`mcp_oauth_autocomplete_ok`（浏览器腿：授权 URL 外开 + callback 自动完成 + token + Reconnected）+ `mcp_status_live_update_ok`（**2.35 修复路径直接实测**：OAuth 成功 → adapter 重连 → 快照转发 → 徽标 Not connected→Connected+2 tools）+ `mcp_paste_dialog_ok` + `mcp_oauth_manual_paste_ok` + `mcp_credentials_zero_leak_ok` 全绿。
4. **110 双端矩阵 — 2.35.0 复跑全绿**：`packages_install_ok` / `packages_tui_side_reflected_ok` / `packages_new_session_loads_ok`（新会话 slash_commands 含包技能命令）/ `packages_project_untrusted_ok`；真实对象 pi-mcp-adapter 2.35.0 + pi-subagents 0.70.1 双端列表与加载面正常。

**2.35 新能力 = 观察项不立项**（per spec）：Jev、MCP Tasks、`/mcp edit`、runtime-only approval、`namespaceProxyTools` 开关、CJK 工具搜索——均不触及 PiCode 消费面（快照形状/写目标/OAuth 桥），零动作。

**验证命令**：vitest 1961/1961（116 文件，+2 为 ② 的写者保真测试）；typecheck 双 tsconfig 清；host-contract smoke PASS（Round G OAuth 桥契约 + Round I 状态快照契约含 additive 报备）；electron smoke 全量 EXIT=0（0 FAIL，38 hosts 无孤儿，`SMOKE done`）——89/96/110 既有断言在 2.35.0 上全绿。

**dev-app serialization 披露**：首次 electron smoke 启动时 wt-111 的 smoke r2 恰在飞行中（pgrep 已见其进程但未避让——流程失误，如实记录）；该跑 EXIT=0 全绿但证据弱化，已在其窗口清空后（pgrep 轮询确认干净）重跑一次，本记录以干净跑为准（两跑结论一致全绿）。另：更早一轮曾因 t93 scroll 竞态挂过一次（scrollTop:0，模型速度类既有竞态，与票 96/110 记录同款；干净跑该阶段过）。

**交付物**：`src/main/settings/mcp-service.ts` 写者保真修复 + `src/shared/mcp-status.ts` / `src/shared/mcp-management.ts` 保真注记升 2.35.0 + `tests/main/mcp-service.test.ts` 两条写者测试；纯逻辑/取证工单，无 UI 可截图面（smoke 断言与文件写入，视觉零变化）。

### 2026-09-21 code-review 双轴采纳（review-spec + review-standards 并行，fixed point main 5b7b0de...e6c02a4）

两轴均零硬违规，判断性意见逐条处置：

- **Standards 轴（0 硬违反，4 判断性）**：① `rm(temp)` 判 Speculative Generality —— **不采纳，留档理由**：adapter `writeConfigText` 同样先 rm（镜像保真即本票目的），且 stale temp 被 truncate 而非新建时 open mode 不生效，rm 是 mode 保留契约的确定性前提；② writeFile 三元两份 options —— **采纳**（单对象，mode undefined 即默认）；③ 两镜像文件重复版本注记 —— reviewer 自判被仓库惯例覆盖，不动；④ 裸 `catch {}` 吞非 ENOENT 错误 —— **采纳**：catch 收窄到 ENOENT（缺失/悬空别名按字面路径写，adapter 同款），其余错误重抛 → 动作诚实报错而非静默替换解析不了的别名（EACCES 场景正是本票所修漂移的无声复发路）。
- **Spec 轴（无 scope creep，2 采纳 + 1 留痕）**：① 修复 sha 未在票内明写 —— **采纳**（上文已补 e6c02a4）；② mode 保留与 adapter 契约不完全保真（open mode 受 umask 掩码，adapter 在 writeFileSync 后追加 chmodSync）—— **采纳，TDD 修复**：新用例 0o664（umask 0o022 下丢组写位，红）→ `writeRawDoc` 补 `chmod(temp, mode)` 两步（adapter 同形，绿）；悬空 symlink 行为 reviewer 确认 adapter 同款非问题；③ serialization 首跑违规 —— 已在实现记录披露为流程瑕疵，不另动作。

**采纳后复验**：vitest 1962/1962（+1 umask 用例）、typecheck 双清；改动面（mode 两步保留 / catch 收窄 / options 归一）均被 mcp-service 22 用例覆盖，常规文件写入字节不变，electron smoke 的文件断言面不受影响（既有全绿记录继续有效）。
- 2026-09-21 (merge session，per 操作者验收指令「115 工单已验收」)：Status 翻转 ready-for-human（验收框 3/3 既有勾选在案；证据链 = Comments 实现+重验清单、code-review 双轴采纳含 chmod 两步与 ENOENT 收窄）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
