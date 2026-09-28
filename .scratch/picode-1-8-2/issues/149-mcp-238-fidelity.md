# 149: pi-mcp-adapter 2.38.0 fidelity——注释水位 + stdio `~/` 提示 + MCP smoke 段复核

**Status:** ready-for-human
**Branch:** t149-mcp-238-fidelity
**Blocked by:** —

## What to build

1. **两处 fidelity 注释 2.37.0 → 2.38.0 + 重验注记**：
   - `src/shared/mcp-management.ts:9`（`Adapter fidelity (pi-mcp-adapter 2.37.0, re-verified for ticket 148):` → 2.38.0 / ticket 149）+ 插入 2.38 重验注记，要点（证据 = `.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md` §2.1/§3）：
     - 合并本体与全部写器（mergeConfigs / mergeServerMaps / URL-bound auth 剥离 / transport 清场 / writeProjectServerDisabledOverride / writeSharedServerEntry / `/mcp setup` 两写目标 / applySettingDefaults / writeJevSemanticSearchConfig）逐行未变；README:76 "write targets … unchanged" 引语在 2.38 逐字在案（行号未变）；
     - 2.38 的 OpenCode v2 导入归一化（`mcp.servers` 展平 + snake_case OAuth 映射）与 ancestorConfigRoots 校验放宽均属 adapter 的 host-import/发现面——永不进 PiCode 层模型、永不写（数据安全红线原文照旧）；
     - stdio `~/` 展开（PR #655）是**运行时 spawn 行为**（adapter server-manager.ts spawn 时展开 command/args/cwd），config 文件与 PiCode 合并视图保存/读取的都是原始 `~/...` 字符串——**显示保真成立**，PiCode 合并/编辑/显示模型零跟进。
   - `src/shared/mcp-status.ts:10`（同版本与票号更新）+ 插入 2.38 重验注记，要点（证据 = 报告 §2.2/§4-b/§4-e）：
     - adapter `mcp-status.ts` 字节相同；`MCP_STATUS_SNAPSHOT_VERSION = 1` 与频道 `pi-mcp-adapter/status/v1` 均未 bump/未变名——v1 投影与 pinned-channel 订阅照旧完全有效；
     - 2.38 的 search-mode 工具经一次成功代理调用转正（PR #670）与 keep-alive 运行时注册发布修复（issue #671）均为运行时行为，**不触碰快照形状**（directToolCount 来自 direct 工具面同步、激活路径不触发快照重发）。
   - 注释内既有 2.35/2.37 历史叙述保留（历史叙事不改写，只更新水位与追加 2.38 注记；`2.37 leaves every write target in place … still verbatim in 2.37` 一类句式的版本引用改为涵盖 2.38 的表述由实现裁量，最小改动优先）。
2. **McpSection stdio `~/` 提示行**：`src/renderer/src/components/settings/McpSection.tsx` 加/编辑对话框（`settings-mcp-form`）stdio transport 分支末尾（Environment 字段之后）加一行提示，**复用既有 `settings-mcp-form-note` 类、零新 CSS**，文案精确为：
   `Tip: paths starting with ~/ are supported in the command and arguments (expanded when the server starts).`
   （UI 文案全英文；该提示只在 stdio 分支渲染——`~/` 不适用于 Remote(url)；零 smoke/test 断言面——已核对 smoke 与 tests 均无该表单 placeholder/文案断言。）
3. **MCP smoke 段复核**：用户级 adapter 2.38.0（环境前置已由 intake 升级）下——`npm run smoke:host` 全套 PASS（含 Round G ticket-89 OAuth 桥 / Round I ticket-96 状态投影）+ `npm run smoke:electron` 全套 PASS（MCP 段 16 断言全绿，含 OAuth 自动腿 + 手动粘贴腿；OAuth 双腿同时实测 `@napi-rs/keyring` ^1.3.0→^2.1.0 major bump 后的 macOS keychain 行为）。

## 背景（取证）

- 调研报告：`.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md`（npm pack 2.38.0 解包 /tmp/mcp238 对照用户级 2.37.0 全量 diff；changelog 逐字；九消费面逐项 file:line 判定；契约面核对表 §3；初判线索 a–g 逐条实证 §4）。
- 硬死面：无——快照 version 1 + 频道未变、合并/写器逐行未变、peer 含 SDK 0.87.1、README:76 引语在案（§3）。
- 上一版先例：T148（`.scratch/picode-1-8-1/issues/148-mcp-237-fidelity.md`）同型交付（fidelity 注释 + jev 共存单测 + smoke 段复核）；本票无 jev 共存新增（writeJevSemanticSearchConfig 未变，既有 4 用例继续通过，零改动）。
- `~/` 提示透出依据：调研 §8-C 第 1 条「最值得透出」——`~/` 在 command/args/cwd 运行时展开（报告 §4-a：utils.ts:250-261 expandHomePath、server-manager.ts:1048,1051-1054 spawn 时展开），文件层不展开，PiCode 表单写入原文即被 adapter 正确展开。
- 注意点（非降级）：含 `~` 的 stdio command 缓存指纹升级后一次性失效（adapter 内部，无需动作）；keyring major bump 由 OAuth 双腿实测覆盖（§4-f/残余风险）。

## Acceptance

- [ ] 两处 fidelity 注释水位 2.38.0 + 2.38 重验注记在案（引调研报告证据；历史叙述保留）
- [ ] McpSection stdio 分支 `~/` 提示行渲染（精确文案；`settings-mcp-form-note` 类；仅 stdio 分支；Remote 分支无此行）
- [ ] `npm run smoke:host` 全套 PASS（Round G/I 在内；dev-app serialization：ps 自查 + sleep 60 重试上限 30 分钟）
- [ ] `npm run smoke:electron` 全套 PASS（MCP 段 16 断言全绿，OAuth 双腿在内）
- [ ] vitest 全绿（`env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`）
- [ ] typecheck（tsc --noEmit ×2）+ eslint touched 零问题
- [ ] 除三处目标文件（mcp-management.ts / mcp-status.ts 注释块、McpSection.tsx 一行）外零源码改动（mcp-status / auth-bridge / status-bridge / mcp-service / smoke / tests 全部不动；Seam-1：零 adapter import）

## Comments

- 2026-09-26（intake 立票）：定稿轮操作者裁决「全部按照推荐来」——R1 提案照立（唯一工单）；stdio `~/` 帮助文案并入本票（裁决点 A 推荐）；exposeResources 投影等四项遗留维持留盘点（Q2 + 调研 §6 零新交互）。环境前置（adapter → 2.38.0）由 intake 在交付执行 prompt 后执行（Q3）。
- 2026-09-27（implementation，43c516e）：三件交付——①两处 fidelity 注释 2.37.0→2.38.0 + 2.38 重验注记（mcp-management.ts:9：合并本体与全部写器逐行未变——mergeConfigs / mergeServerMaps / URL-bound auth 剥离 / transport 清场 / writeProjectServerDisabledOverride / writeSharedServerEntry / `/mcp setup` 两写目标 / applySettingDefaults / writeJevSemanticSearchConfig，README:76 引语逐字在案；OpenCode v2 导入归一化 + ancestorConfigRoots 放宽 = host-import/发现面永不镜像永不写；stdio `~/` = 运行时 spawn 行为，config 文件与合并视图保存原始 `~/...` 串，显示保真成立；mcp-status.ts:10：adapter mcp-status.ts 字节相同，MCP_STATUS_SNAPSHOT_VERSION=1 与频道 pi-mcp-adapter/status/v1 未 bump，PR #670 转正与 #671 keep-alive 均运行时行为不触碰快照形状；另 OAuth 面注记：/mcp-auth 流文件 2.38 字节不变 + #657 keyring 读复用修复为 adapter 内部行为）；②McpSection.tsx stdio 分支提示行（精确文案、settings-mcp-form-note 复用、零新 CSS、仅 stdio 分支，Remote 无）；③MCP smoke 段复核：smoke:host 全套 PASS exit 0（Round G ticket-89 OAuth 桥 + Round I ticket-96 mcp_status v1 绿，用户级 adapter 2.38.0 实装核对）。其余门：vitest 2193/2193（env -u 纪律）、typecheck ×2、eslint touched 零问题。恰三文件 44+/8-，零其他源码改动。
- 2026-09-27（过程披露——smoke:electron 六跑未过；操作者裁决 1(a) 证据式闭环，1.8.1 EV-0029 先例）：**精确分解**：runs 1-3（本分支，环境嘈杂）死于 t105「the trusted keystroke never echoed in the shell」×3；run 4（stash 后干净 base be58710 A/B；src 与 1.8.1 发版提交 14b5c88 字节相同）t105 逐字同败；run 5（操作者静默窗 #1）死于 menu_keyboard「the slash menu walk rested at 5/11」（页内 dispatchEvent 时序类，t105 未到达）；run 6（静默窗 #2）menu_keyboard 全绿（含 run 5 失败的同一条行走）后再死 t105 同一逐字失败。t105 合计可达即败 5/5（runs 1,2,3,4,6）；MCP 段（t105 之后）六跑均未到达。机制（run 6 fail log recent-events dump 实证）：smoke 自身后台会话（8828a5）真实模型流（默认 GLM-5.3 重思考，29+ thinking_delta）恰在 t105 按键探测期饱和 renderer 任务队列，keyDown→pty→echo 往返超出 t135 时代 1.5s echo 轮询窗——命中 smoke.ts t135 harness rider 注释记载的套件负载类；smoke:pty 独立绿（fish 4.2.1，装于 2025-12-17，早于 Sep 24 全绿证据）排除 pty/shell/echo seam。本票 diff 无罪（t105 A/B 实证；menu_keyboard 结构性无关）。残余风险：MCP 段 16 断言 + OAuth 双腿（@napi-rs/keyring ^1.3.0→^2.1.0 major bump 的 macOS keychain 实测，调研 §4-f）本轮 app 级未实测——缓解：smoke:host Round G OAuth 桥合约绿 + /mcp-auth 流面 2.38 字节不变（§2.4）+ keyring 服务/账号名未变；T150（LIA-215）harness 修复后将重交 MCP 段 2.38.0 证据。
- 2026-09-27（双轴评审，双 pass-with-notes，零 blocker）：
  - Spec 轴（review-spec）：pass-with-notes——①Acceptance 第 4 项 smoke:electron 未达成 = 已裁决闭环 + T150 跟进，披露如实；②mcp-management.ts:69-72 OAuth bullet #657 注记为注释级轻微超范围（证据 §2.4/§4-f 在案、目标文件内、零行为影响）；③commit body 六跑分解句压缩有歧义（本 Comments 已给精确分解）。逐项确认：两处注释要点齐全 + 历史叙述保留；提示行文案 md5 逐字符匹配 + 类复用 + 仅 stdio；红线恰三文件零 adapter import；声明与证据（六份 /tmp 日志）逐份吻合。
  - Standards 轴（review-standards）：pass-with-notes，零 blocker——注记逐条对上调研（§2.1/§2.2/§3/§4-a/b/e/f），与 CONTEXT.md MCP 节术语一致；提示行 McpSection.tsx:575-577 合规；提交信息惯例符合、验证声明逐项核实。Non-blockers：①commit body 六跑措辞压缩（同 Spec ③，本 Comments 已给精确分解）；②2.38 重验叙述三处近重复（票面明令此型，repo 先例覆盖）。
- 2026-09-27（验证记录）：smoke:host 全套 PASS exit 0（Round G/I 绿）；vitest 2193/2193；typecheck ×2；eslint touched 零问题；smoke:electron 六跑受阻（见上披露，操作者证据式闭环）；smoke:pty EXIT=0。日志：/tmp/t149-smoke-host.log、/tmp/t149-smoke-electron{,-2,-3,-base,-rulingA,-run6}.log。
