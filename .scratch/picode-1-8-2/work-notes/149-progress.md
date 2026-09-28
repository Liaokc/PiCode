# T149 work-notes（执行会话 → 跨工区可见进度笔记）

- 票：.scratch/picode-1-8-2/issues/149-mcp-238-fidelity.md（LIA-214）
- Worktree：.worktrees/wt-149-mcp-238（分支 t149-mcp-238-fidelity，基于 main be58710）
- 2025-01-30 派工：worker run f61ebf87（model bella-local/GLM-5.3:max）已启动。
  - 任务：① mcp-management.ts:9 / mcp-status.ts:10 fidelity 注释 2.37.0→2.38.0 + 2.38 重验注记（要点见票面，证据=调研报告 §2.1/§2.2/§3/§4）；② McpSection.tsx stdio 分支 Environment 字段后加 settings-mcp-form-note 提示行（精确文案见票面）；③ smoke:host + smoke:electron 全套（MCP 段 16 断言 + OAuth 双腿，dev-app serialization 纪律）；vitest/typecheck/eslint touched；提交分支不合并。
- 等待 worker 完成后：双轴评审（review-standards / review-spec）→ 票面 Status 改 ready-for-human → 根工作区 scripts/merge-ticket.sh 149 → Linear LIA-214 评审记录 + Done → 收尾门（npm test / npm run smoke / npm run package:verify）→ 截图（MCP 加/编辑对话框 stdio 提示行）→ 总报告。

## 2026-09-27 worker hold 期交付物归档（run f61ebf87 完成态，草案防丢）

### DRAFT 1 — B 方案票 Comments 披露文案（B 裁决时追加到 issues/149-mcp-238-fidelity.md）

- 2026-09-27（implementation，过程披露）：smoke:electron 四连死于 ticket 105 trusted-keystroke 腿（"the trusted keystroke never echoed in the shell"）——3 次本分支 + 1 次 stash 后干净基线 A/B 对照，失败逐字相同；基线 src 与 1.8.1 发版提交 14b5c88 字节相同（`git log 14b5c88..be58710 -- src/` 为空），本票 diff（两处纯注释 + McpSection 一行静态提示）与该腿零交互（settings 窗未开、t105 在 MCP 段之前）。归因 1.8.1 run-log EV-0028（commit b4b1e30）已定性的前台活动类：macOS 在用户输入期间拒绝 focus-steal + IME 输入混流（menu-keyboard 断言 dump 曾实捕操作者 IME 实时输入「我想知道」）；安静机直跑 9 次该腿 0 失败 + 1 次整段全绿 EXIT=0。MCP 段（16 断言 + OAuth 自动腿/手动粘贴腿）位于 t105 之后，四跑均未到达——用户级 adapter 2.38.0 在位（实装核对），但 @napi-rs/keyring ^1.3.0→^2.1.0 major bump 后的 macOS keychain OAuth 双腿未在本轮 app 级实测（调研 §4-f 残余风险，/host-contract Round G OAuth 桥合约面已绿）。smoke:host 全套 PASS exit 0（Round G ticket-89 OAuth 桥 + Round I ticket-96 mcp_status v1 绿）；vitest 2193/2193（env -u 纪律）、typecheck ×2、eslint touched 全绿。

### DRAFT 2 — 最终提交计划（A/B 通吃；A 只是在 commit body 加 smoke:electron PASS 行）

1. `git add src/shared/mcp-management.ts src/shared/mcp-status.ts src/renderer/src/components/settings/McpSection.tsx`
2. `git restore package-lock.json`（预存 5 行 npm install 噪声：lock 版本 1.8.0→1.8.1 + ignore dev 标记——票外，保树净供 merge-ticket.sh）
3. `git commit` — subject: `fix(149): pi-mcp-adapter 2.38.0 fidelity — comment watermark + stdio ~/ tip`；body: (a) fidelity 注释 2.37.0→2.38.0 + 2.38 重验注记（合并/写器逐行未变 incl. applySettingDefaults/writeJevSemanticSearchConfig、README:76 逐字在案；OpenCode v2 + ancestorConfigRoots = host-import/发现面永不镜像永不写；stdio ~/ = 运行时 spawn 行为、原文 ~/... 串保留、显示保真成立；mcp-status 字节相同、v1+频道未 bump；PR #670/#671 运行时改动不触碰快照形状），(b) McpSection 仅 stdio 提示行（精确文案、settings-mcp-form-note 复用、零新 CSS），(c) 验证块（vitest/typecheck/eslint/smoke:host PASS + 按裁决的 smoke:electron 结果）。

分支 tip 保持 be58710 + working tree，等裁决。

## 2026-09-27 run 5-6 后：刷新版 DRAFT 1（B/证据式收尾披露文案，worker reply channel 原文归档）+ 执行会话机制取证

### 机制取证（执行会话）
- smoke:pty EXIT=0（fish 4.2.1 登录 shell spawn→marker echo→resize→exit 全绿）→ pty/shell/echo seam 健康；fish 装于 2025-12-17，早于 Sep 24 全绿证据 → 换 shell 假设排除。
- run 6 fail log recent-events dump：t105 按键探测期间 smoke 自身后台会话 8828a5 持续 thinking_delta 流（29+ 条）→ 命中 smoke.ts t135 harness rider 注释记载的 renderer 饱和类（当年三连败，缓解 = echo 轮询 80ms→1.5s；当前默认模型 GLM-5.3 重思考流疑再度顶过 1.5s）。
- 结论：t105 = 套件自身负载/环境类。非操作者活动（两静默窗无效）、非本 diff（A/B 实证）、非 pty seam（绿）、非 adapter（不经；smoke:host Round G/I 在 2.38 下绿）。Sep 24 后环境变化候选 = smoke 默认模型/GLM-5.3 流型。

### 刷新版 DRAFT 1（覆盖 6 跑，worker 已备，未落盘）
- 2026-09-27（implementation，过程披露）：smoke:electron 六跑未过——前四跑（3 本分支 + 1 stash 后干净基线 A/B 对照）全部死于 ticket 105 trusted-keystroke 腿（"the trusted keystroke never echoed in the shell"，真实 sendInputEvent→pty→echo 往返腿，逐字相同）；第五跑（操作者静默窗 #1）改死于 menu_keyboard 斜杠菜单行走（"the slash menu walk rested at 5/11"，页内 dispatchEvent 时序类）；第六跑（静默窗 #2，最终尝试）menu_keyboard 全绿（含同一条斜杠行走）后再死于 t105 同一逐字失败。基线 src 与 1.8.1 发版提交 14b5c88 字节相同（`git log 14b5c88..be58710 -- src/` 为空），本票 diff（两处纯注释 + McpSection 一行静态提示）与两腿零交互（t105 有 A/B 实证；menu_keyboard 为页内 DOM 派发、settings 窗未开）。t105 现为可达即败 5/5（含两次静默窗与干净基线），超出 1.8.1 EV-0028（commit b4b1e30）前台活动类的纯 flake 解释——疑似当前环境确定性面（pty/shell echo 往返或 sendInputEvent 投递层），2026-09-24 全绿证据之后环境有变（含用户级 adapter 2.37→2.38 实装；t105 的 dock shell 为纯 SHELL 环境派生、不经 adapter）。MCP 段（16 断言 + OAuth 自动腿/手动粘贴腿）位于 t105 之后，六跑均未到达；@napi-rs/keyring ^1.3.0→^2.1.0 major bump 后的 macOS keychain OAuth 双腿未在本轮 app 级实测（调研 §4-f 残余风险；缓解：/mcp-auth 流面 2.38 字节不变 §2.4 + smoke:host Round G OAuth 桥合约绿 + keyring 服务/账号名未变）。其余门全绿：smoke:host 全套 PASS exit 0（Round G ticket-89 OAuth 桥 + Round I ticket-96 mcp_status v1）、vitest 2193/2193（env -u 纪律）、typecheck ×2、eslint touched 零问题。
- 执行会话补充注记（并入披露或评审记录）：smoke:pty 独立绿（fish 4.2.1，装于 2025-12-17 早于 Sep 24 证据）；run 6 recent-events dump 实捕后台会话 8828a5 thinking_delta 流正在 t105 探测期饱和 renderer——命中 smoke.ts t135 harness rider 注释记载的套件负载类（1.5s echo 轮询为 t135 时代缓解；当前默认模型 GLM-5.3 重思考流疑再度越限）。

（DRAFT 2 提交计划不变：仅三目标文件 + restore lockfile + subject `fix(149): pi-mcp-adapter 2.38.0 fidelity — comment watermark + stdio ~/ tip`；verification block 按裁决如实引用 smoke:electron 受阻结果。）
