# 48: SDK 对齐升级 0.84.3→0.85.1——三段式（侦察 → 操作者检查点 → 实施）

**What to build:** PiCode 内嵌 SDK 与操作者实际运行的全局 pi 对齐（0.85.1，2026-09-09 实查三处一致），ADR-0005 受控升级的执行票。三段式推进：① **侦察**——产出 0.84.3→0.85.1 的 changelog diff 与 API 面改动清单（host/renderer 消费的 SDK 接口、SessionManager/entry 语义、会话格式兼容性），写入本票 Comments；② **操作者检查点**——清单交操作者过目拍板后才动代码（操作者明言"具体有什么改动需要和我讨论"；若实施时 npm 已越过 0.85.1，回到本检查点重新拍板，不自行升目标）；③ **实施**——依赖升锁 0.85.1 + 适配 + 互通冒烟（TUI 0.85.1 建会话 → PiCode 打开续写，反向照旧）+ 全门禁。

**Blocked by:** None (can start immediately)。

**Status:** resolved

- [ ] 侦察清单入票 Comments；操作者在检查点明示拍板（留痕）
- [ ] 内嵌依赖 = 0.85.1；typecheck / lint / vitest 全绿
- [ ] 互通冒烟通过：TUI 0.85.1 与 PiCode 同会话打开互续（ADR-0005 门禁）
- [ ] npm run smoke 六阶段 ALL GREEN（或按侦察结论报备的等价门禁）
- [ ] 实施中发现的 SDK 行为变化（尤其 fork/entry/事件语义）记录 Comments——后续票（51/52）以此为基准
- [ ] 全英文文案；改动范围仅依赖锁 + 必要适配，产品语义零漂移

## Comments

- 2026-09-09 (requirements intake): 建票（spec R0，Q13 三段式拍板 + Q9 升级对齐拍板）。目标版本 0.85.1 已实查锁定。波次：**W1 先行**——51/52 在本票合入后开。
- 2026-09-09 (phase ① recon, read-only): 0.84.3（PiCode node_modules 实装）→ 0.85.1（全局 pi 同版）逐文件 diff（SDK dist/**/*.d.ts + 传递依赖 pi-agent-core / pi-ai d.ts + 双方 package.json + 真实会话库磁盘取证）+ npm registry 实查（latest = 0.85.1，未越过目标，无需重新拍板）。**结论：对 PiCode 是 drop-in 升级——预期源码零适配，唯一必改文件是 package.json + lockfile**。清单：
  1. **根导出面（PiCode 唯一消费缝）**：纯增量。新增类型 UIPromptStartEvent/UIPromptEndEvent/UIPromptKind、CustomEditorOptions；新增值导出 detectSupportedImageMimeTypeFromFile。无删除无改名。PiCode 现有全部 import（AgentSession、AgentSessionEvent、AgentSessionRuntime、CreateAgentSessionFromServicesOptions、SessionEntry、SessionManager、SessionStartEvent、InlineExtension、ToolCallEvent、ToolCallEventResult）形状逐字节不变。
  2. **PiCode 调用的全部签名——不变**：SessionManager.open/create（inMemory 增可选 entries 参数，additive）、createAgentSessionServices、createAgentSessionFromServices、createAgentSessionRuntime + factory 形状、getAgentDir、ModelRuntime.create、readStoredCredential；AgentSession 的 prompt/steer/followUp/clearQueue/setModel/setThinkingLevel/getAvailableThinkingLevels/compact/abort/navigateTree/setSessionName；runtime.fork(entryId,{position:'at'})→{cancelled} 与 navigateTree→{cancelled} 一致（agent-session-runtime.d.ts 逐字节相同）；resourceLoader.getPrompts/getSkills 与 Skill 形状不变（core/resource-loader.d.ts 相同）。
  3. **事件语义（51/52 基准）**：AgentEvent（agent_start/message_*/tool_execution_*/agent_end）在 pi-agent-core 中逐字节相同；AssistantMessageEvent（text/thinking delta 族）与 Usage 相同；AgentSessionEvent 联合唯一变化 = auto_retry_end 成员去重（0.84.3 里声明了两次，PiCode switch 有 default 兜底，零影响）。entry_appended 仍携带完整 SessionEntry（含真实 id）；message_end 仍只带 message（无 entry id）→ **票 51 的 host 落盘回读真实 id 路线仍是唯一正确做法，0.85.1 未新增替代设施**。fork 行为修复（0.85.0：fork 保留 compaction boundary；内存会话 turn 未 settle 时 fork）是 runtime 内部语义修复，无 API 变化，对 fork 转写保真度是正向。
  4. **会话 jsonl 格式——双向兼容**：CURRENT_SESSION_VERSION = 3 两版相同；SessionHeader/SessionEntry 联合不变；磁盘取证：TUI 0.85.1 最新写入文件（2026-09-09）首行 {"type":"session","version":3,...} 与 0.84.3 时代文件完全同构。0.85.1 pi-agent-core 内部新 JSONL_FORMAT_VERSION=4 存储层经 legacy normalizer 读 v3（"without touching the source file"）——无落盘迁移。PiCode 自有解析器（parse.ts / usage aggregate）不受影响——无新 entry 类型。
  5. **auth-probe 思考档位镜像**：0.85.1 的 getSupportedThinkingLevels 实现逐字节相同（EXTENDED_THINKING_LEVELS = off/minimal/low/medium/high/xhigh/max）——supportedThinkingLevels() 注释里 "verified against 0.84.x" 的结论继续成立。
  6. **打包面**：SDK 依赖变化——新增 @earendil-works/chord；pi-protocol/pi-client 移到 devDeps（PiCode 从不直接 import 它们，只需锁 pi-coding-agent 本体）。实验性 ./client 与 ./experimental/plugin 子路径改为 source-only（dist 已剔除）——PiCode 只走根入口，不受影响。engines 不变（node >=22.19）。发布注意：**0.85.0 是 SDK import 损坏的发布（0.85.1 修复）——任何情况下不得锁 0.85.0**。
  7. **其余增量（PiCode 均不消费）**：model-config 可选字段（vllmPriority/supportsMaxOutputTokens/supportsMidConvoEffort）、AssistantMessage.providerThinkingLevel、ModelRuntime.streamDeferred、formatSkillsForPrompt 可选第二参、settings 终端能力覆写、isBundledNode、keybinding app.thinking.save；BranchSummaryMessage.fromId 放宽为 string|null（仅内存 AgentMessage；落盘 BranchSummaryEntry.fromId 仍为 string）。

  ③ 计划（待操作者拍板）：依赖精确锁 0.85.1 + npm install（必要时 ELECTRON_MIRROR），预期零源码改动；门禁 = typecheck / lint / vitest 全绿 + npm run smoke 全链（含互通冒烟 TUI 0.85.1 ↔ PiCode 同会话互续，按 dev-app serialization 与操作者协调时机）。
- 2026-09-09 (checkpoint 拍板留痕): ①清单要点已播报操作者；另按指示将 51/52 基准结论放入票 51/52 Comments。**操作者明示「同意，进入③」**——本票从此进入实施：升锁 0.85.1 + 全门禁 + 互通冒烟。
- 2026-09-09 (phase ③ implementation, t48): **commit `f97c979`**（branch t48-sdk-upgrade-0851，rebase 于 main edc0dc2 后零冲突）。实施记录：
  - **升锁**：`@earendil-works/pi-coding-agent` 0.84.3 → 精确锁 `0.85.1`（无 `^`，ADR-0005 纪律）；侦察结论成立——源码零适配（renderer/shared 零接触）。
  - **门禁**：typecheck 全绿；lint 0 errors（1 存量 warning，未改动树上同在）；vitest **1032/1032**（77 文件，含票 50 新增 2 个）；**npm run smoke 六阶段 ALL GREEN（159s，exit 0）**——build 2s / host contract 48s / pty 4s / usage 1s / **TUI↔SDK interop 双向 PASS（ADR-0005 门禁）** / electron app smoke 100s（90+ 断言含真剪贴板）。
  - **必要适配（烟雾 harness，`src/main/smoke.ts` +18，交操作者裁量）**：macOS 15 在用户活跃使用另一 app 时拒绝焦点抢占并合并激活请求——阶段 6 ticket-44 真剪贴板阶段从会话上下文永远拿不到焦点（首跑套件+单跑+LaunchServices 启动三式均复现）。按票 47 先例（同类别 harness 稳健性微调、断言零弱化）两处 smoke-mode-only 修复：① 冒烟窗口挂全部 Space（含全屏之上，保证可见可点）；② ticket-44 焦点轮询每 100ms 重试抢占（用户停手一瞬即落焦）。修复后需操作者配合一次（约 30 秒勿动），随后全链 ALL GREEN。**若操作者不认可此改动可剥离，但阶段 6 将只能由操作者终端跑**。
  - **code-review（两轴）**：Standards 无硬违规（2 条判断题：焦点抢重试形状与 withWindow 轮询轻微重复——谓词不同可接受；workspaces pin 未单独归因——保留已记）；Spec 全项达成（1 条范围标记：smoke.ts +18 归「必要适配」待确认）。
  - **51/52 基准**：见两票 Comments（message_end 无 entry id / entry_appended 带完整 SessionEntry 不变 → 51 的 host 回读路线不变；resourceLoader/ModelRuntime 面不变 → 52 的 probe 扩展路线成立）。
  - **发版注意**：0.85.0 为 SDK import 损坏版本（0.85.1 修复），任何场景不得锁 0.85.0。merge：`bash scripts/merge-ticket.sh 48`（实现会话不自行 merge）。
- 2026-09-09 (merge, T00): 合入 main —— merge sha `d71250e`（分支重写为 `dd38fef`）。验收口径：操作者明示「48 工单已验收」+ 票内检查点留痕（「同意，进入③」）+ 全门禁绿（实施会话报 smoke 六阶段 ALL GREEN exit 0，含互通冒烟双向 PASS）。smoke.ts +18 harness 适配随验收一并认可（操作者未要求剥离）。簿记 sync `e708488`（分支未携带 tracker，终态取自主工作区盘面，t50 同款惯例）。冲突处置：rebase/合并零冲突（实施会话已预 rebase 到 edc0dc2）。终态审计：package.json 精确锁 `0.85.1`（无 `^`），node_modules 实装 0.85.1（merge 后 npm install 同步——脚本内置验证跑在旧 0.84.3 模块上，已用真 0.85.1 重跑），lockfile 零 `0.85.0`、传递依赖 @earendil-works/chord@0.85.1 落锁，smoke.ts 焦点重试适配幸存，无冲突标记残留；**typecheck 绿 + 1032/1032 tests 绿**（77 文件，与升级前同数——侦察「drop-in」结论成立）。worktree 已清理。
