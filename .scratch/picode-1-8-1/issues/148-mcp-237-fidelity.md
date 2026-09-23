# 148: pi-mcp-adapter 2.37.0 fidelity——注释水位 + jev 共存验证 + MCP smoke 段复核

**Status:** ready-for-human

**What to build:** 调研定论（`.scratch/picode-1-8-1/research/pi-mcp-adapter-2.37.0-diff.md`）：2.37.0 对 PiCode 无硬死面（mcp-status.ts / mcp-setup-panel.ts / server-manager.ts / OAuth 流 / skills 全部字节未变；`MCP_STATUS_SNAPSHOT_VERSION = 1` 与频道 `pi-mcp-adapter/status/v1` 未 bump——票 96 投影安全；config.ts 合并规则逐行未变，仅外包 applySettingDefaults）。本票做 fidelity 水位更新与共存验证：

1. `src/shared/mcp-management.ts:9` 与 `src/shared/mcp-status.ts:10`：fidelity 注释 2.35.0 → 2.37.0 + 重验注记（合并规则逐行未变仅外包 applySettingDefaults、快照 v1 未 bump、OAuth 流未变、jev settings.jev 共存：合并只读 mcpServers、写保留未知键）；
2. **jev 共存单测（Q7-④ 裁决：已配置则可用）**：扩展 `tests/shared/mcp-management.test.ts` 既有 settings 用例——层文档带 `settings.jev`（/mcp jev setup 的写产物，adapter config.ts:1189+ writeJevSemanticSearchConfig）时：parseMcpDocument 保留、mergeMcpLayers 只读服务器条目、deriveServerEntryWrite/Remove 写后 settings.jev 原样幸存；
3. MCP smoke 段复核：host-contract Round G/I + electron smoke MCP 段（含 OAuth 双腿）在用户级 2.37.0 × 捆绑 0.87.1 下全绿。

## Acceptance

- [x] 两处 fidelity 注释 = 2.37.0 + 重验注记
- [x] jev 共存单测在位且绿
- [x] smoke:host 全套 PASS（含 Round G/I）+ electron smoke MCP 段绿（dev-app serialization 纪律）
- [x] vitest 全绿（env -u 纪律）+ typecheck/eslint touched 绿

**Background（取证）:** writeJevSemanticSearchConfig 写 settings.jev 入 .pi/mcp.json（或全局等价物）；PiCode 合并模型只读 mcpServers/mcp-servers 键（mcp-management.ts:195,213）；deriveServerEntryWrite/Remove「unknown keys preserved」（`{ ...rawDoc }` 展开后只动 servers 键）——jev 配置与 PiCode 编辑共存零破坏（intake 已实证）。语义搜索运行时在 PiCode host 会话自动生效（adapter 扩展同载，零 PiCode 改动）。exposeResources 投影 = Q7-③ 裁决不入批（操作者未启用该设置，零差异；启用时仅显示保真缺口，运行时行为不受影响）。2.36/2.37 其余增量（/mcp jev 子命令、allowInstall 门、deferWithMissingMetadata、SYSTEMONE_ENDPOINT）对 PiCode 消费面不可见。证据索引见报告 §5。

**Red lines:** 不 push/不打 tag/不 release；无 IPC 增量；不碰 ~/.pi 环境。

**Blocked by:** 无。

## Comments

- 2026-09-24（implementation，854a6a1）：三件交付——①两处 fidelity 注释 2.35.0→2.37.0 + 重验注记（mcp-management.ts:9：合并规则逐行未变仅外包 applySettingDefaults、jev settings.jev 共存、OAuth 流未变；mcp-status.ts:10：快照 v1 与频道 pi-mcp-adapter/status/v1 未 bump、deferWithMissingMetadata 诚实降级）；②jev 共存单测 4 用例（parse 保留 test:119-127、merge 只读服务器条目 test:237-247、write/remove 后 settings.jev 幸存 test:407-428）+ 顺手修同文件既有 lint（行内 import() → type import，零行为变化）；③MCP smoke 段复核（用户级 2.37.0 × worktree 捆绑 0.86.1）：host-contract Round G（ticket-89 OAuth 桥）+ Round I（ticket-96 状态投影）绿；electron smoke MCP 段 16 断言绿（含 OAuth 自动腿+手动粘贴腿）。
- 2026-09-24（过程披露）：smoke:host 首跑（未剥 subagent 标记）Round K 死（worker 会话自身携带 PI_SUBAGENT_CHILD × main 分支 forkHost() 未剥——即票 144 修复面，买证泄漏真实）；剥标记重跑全套 PASS，与本票纯注释+纯模型测试改动无因果。vitest 首跑同因 PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT 触发一枚既有用例，env -u 后全绿。
- 2026-09-24（dual-axis review）：standards **approve**（0 must-fix / 2 minor / 4 nit：src 非注释行过滤验证零行为面变化；minor = type-import 搭车改动属 scope hygiene 判断性意见 + 注释措辞可补 config.ts 限定；nit = 用例字面量重复/标题措辞/长行/stringly 断言均与 repo 风格相容）；spec **pass**（0 must-fix / 0 partial / 3 note：三项票面全落地且 smoke 证据标记逐一核实非杜撰；SDK 0.86.1 偏差判定为可接受波次时序——票面「× 捆绑 0.87.1」组合由 146 全套冒烟 + 批次收尾回归强制覆盖，2.37 peer 范围含 ^0.86）。
- 2026-09-24（verification）：vitest 2193/2193（125 文件，env -u 纪律）全绿；typecheck tsc --noEmit ×2 零输出；eslint touched 三文件 0 问题（仓库其余 22 问题为历史遗留与本票无关）；smoke:host 全套 PASS exit 0（`SMOKE PASS host contract smoke complete`；Round G `ticket-89 MCP OAuth bridge contract ok`；Round I `ticket-96 mcp_status ok (version 1, 4 servers...)`）；smoke:electron PASS exit 0（MCP 段 16 断言全绿，`multi_shutdown_no_orphans_ok 47 hosts`）。提交链：854a6a1（单提交，分支 tip）。
