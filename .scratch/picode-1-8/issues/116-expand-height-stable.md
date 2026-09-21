# 116: 展开态输入高度稳定——typing-commit 按 expandState 分流

**What to build:** composer 高度 layout effect 的 typing-commit 路径按 `expandState` 分流——**展开态**输入/删除不缩高（重投影 `composerExpandHeight(mainRegionHeight(el))`，expandState 不变）；**收起态**维持既有 auto-grow（74–160px 钳制）。缩矮的唯一触发 = toggle / Esc / ⌘E / 发送成功（expand 状态机语义不变，`shared/composer/expand.ts` 状态机零改动）。

**背景（取证）：** `Composer.tsx` 高度 layout effect 的 typing-commit 路径**不检查 expanded**——每次 value 变更都跑 `composerAutoGrowHeight`（`shared/composer/expand.ts` 钳制 74–160px）。展开态（~400px）下敲一个键 → 高度被打回 ≤160px，但 `expandState` 仍是 'expanded'（右上角还是缩小钮——操作者图11 现场逐字吻合：「正常来说是输入框拉长之后才会有缩小按钮，说明我没有点击缩小」）。**操作者补充：删除字符同症**（同一路径，value 变更即触发）。

**Blocked by:** 无（composer 群首票）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：typing-commit 高度分流决策表（expanded × 输入/删除；collapsed 回归）表驱动进 `expand.ts` 或票内纯函数
- [x] electron smoke：展开态输入与删除高度稳定（≥280px 不缩）；收起态 auto-grow 74–160 不回归；发送后收回（'sent'）不回归
- [x] 展开态窗口 resize 重投影路径（既有）不回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P12 + 操作者补充（删除字符同缩）定稿为 R11。根因 file:line：typing-commit 路径无 expanded 分支。修法唯一免问。同文件群串行首票（116→117→118）。
- 2026-09-22 (implemented, self-reviewed)：分支 `t116-expand-height` tip `1648d8705e01d74482a91814d14ca0c4abf4c74f`（实现提交；票面翻转随其后一小笔提交）。变更：① `shared/composer/expand.ts` 新增表驱动纯函数 `composerTypingHeight(expandState, {contentPx, mainAreaPx})`——expanded 行 = `composerExpandHeight(mainAreaPx)`（不读 content；输入/删除同路径），collapsed 行 = `composerAutoGrowHeight(contentPx)`（不读 mainArea）；状态机 `EXPAND_TRANSITIONS`/`reduceComposerExpand` 零改动。② `Composer.tsx` layout effect typing-commit 按 expanded 分流：展开分支单次写重投影（不走 auto 往返——auto 穿透会杀掉 armed glide，且无需测 content）、收起分支保留既有 auto-reset 仪式，两分支均经 seam 定高；零 setState（票 49 纪律）。③ `tests/shared/composer-expand.test.ts` 增 4 组决策表（expanded 对 content 含 NaN/∞ 的不变性、collapsed 对 mainArea 的不变性、同测量异态分裂、展开带边界）44 用例全绿。④ smoke：新增 ticket-116 stage（收起带内增长、展开态单行输入/40 行内部溢出/尾删/清空均保持投影高度、真实窗口 resize 双向重投影、发送收回回归，末段一次真实模型往返）。验证链：typecheck 绿；vitest 1973/1974（唯一失败为预存环境依赖项 `tests/main/subagent-runner-root.test.ts`，干净分支同样失败）；electron smoke 本票 stage 六项 + composer 家族（49/81/91）三晚三次运行全绿（展开态实测 ~424px 不缩）。
- 2026-09-22 (smoke-harness 报备，两处均仅 smoke 层)：① ticket-81 stage 收尾补 Esc 收起 + 74px 探针——其 reduced-motion leg 最后把 composer 展开后从不清回；旧代码下其收尾 clear 会经**本票修复的旧 bug** 把高度压回 74，ticket-91 起点断言一直踩着该 bug 通过，本修复将其暴露；现兑现其自身「leave the composer clean」注释承诺。② ticket-88 fixture 探针改为等待图片 load/error 落定后补发的第二份 probe——内联脚本在解析期同步读 `naturalWidth`，相对路径 PNG 异步加载构成负载相关竞态（本分支 run4 与 wt-123 同晚同断言失败，跨分支实证）；css 检查仍取首条（样式表阻塞脚本，确定性）。
- 2026-09-22 (遗留风险，主 Agent 裁决不追)：全量 electron smoke 今晚在任何分支均无法全绿。ticket-90 stage（subagents Running 徽章翻转）在本分支 run5/7 失败，但为**跨分支预存故障**：wt-120/smoke5、wt-121/run2、wt-121/base-smoke3（均无 composer 改动）同晚同断言同签名失败；wt-123 另败于 75/88；wt-120 另败于 105/91/46。环境 = 多个并行 worktree 抢同一模型 API。本票 diff 触不到 subagents 面板与 host 事件管线；证据指针：`/tmp/t120-smoke5.log`、`/tmp/t121-smoke-run2.log`、`/tmp/t121-base-smoke3.log`、`/tmp/t123-electron-smoke*.log`、`/tmp/t116-smoke-run7.log`。slash_gate（run2）与 81-band（run6）为一次性 flake，后续运行均复绿。供后续在安静环境复评。
- 2026-09-22 (根因指针补录，主 Agent 通道)：ticket-90 预存失败已有定案记录——票 121 实现者在裸 base `50ba1b4` A/B 复现同断言（无任何本批次改动），根因假设 = pi-subagents fleet RPC 回复失败 → 回复带 `available:false` → `foldSubagentStatus` 整体忽略快照（`src/main/subagent-bridge.ts:148` + `src/shared/session-registry.ts:241`），与本批次大量并发 subagent 占用 provider 相关（票 121 Comments 有完整取证）。本票不追、不为此改代码。
- 2026-09-22 (帧处置，merge-gate 卫生)：visual:expand 复跑重写了 4 帧归档。处置：e2-expand-open.png（本票 UI 证据帧：展开态 + 14 行长草稿保持 ~半区高度，报告所引截图）随分支提交；e1-expand-collapsed.png / e1a-text-clearance.png / e2b-expand-clearance.png（票 49/58 基线帧，非本票证据，复跑意外重写）git checkout 还原，不重写基线归档帧。
