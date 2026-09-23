# 148: pi-mcp-adapter 2.37.0 fidelity——注释水位 + jev 共存验证 + MCP smoke 段复核

**Status:** ready-for-agent

**What to build:** 调研定论（`.scratch/picode-1-8-1/research/pi-mcp-adapter-2.37.0-diff.md`）：2.37.0 对 PiCode 无硬死面（mcp-status.ts / mcp-setup-panel.ts / server-manager.ts / OAuth 流 / skills 全部字节未变；`MCP_STATUS_SNAPSHOT_VERSION = 1` 与频道 `pi-mcp-adapter/status/v1` 未 bump——票 96 投影安全；config.ts 合并规则逐行未变，仅外包 applySettingDefaults）。本票做 fidelity 水位更新与共存验证：

1. `src/shared/mcp-management.ts:9` 与 `src/shared/mcp-status.ts:10`：fidelity 注释 2.35.0 → 2.37.0 + 重验注记（合并规则逐行未变仅外包 applySettingDefaults、快照 v1 未 bump、OAuth 流未变、jev settings.jev 共存：合并只读 mcpServers、写保留未知键）；
2. **jev 共存单测（Q7-④ 裁决：已配置则可用）**：扩展 `tests/shared/mcp-management.test.ts` 既有 settings 用例——层文档带 `settings.jev`（/mcp jev setup 的写产物，adapter config.ts:1189+ writeJevSemanticSearchConfig）时：parseMcpDocument 保留、mergeMcpLayers 只读服务器条目、deriveServerEntryWrite/Remove 写后 settings.jev 原样幸存；
3. MCP smoke 段复核：host-contract Round G/I + electron smoke MCP 段（含 OAuth 双腿）在用户级 2.37.0 × 捆绑 0.87.1 下全绿。

## Acceptance

- [ ] 两处 fidelity 注释 = 2.37.0 + 重验注记
- [ ] jev 共存单测在位且绿
- [ ] smoke:host 全套 PASS（含 Round G/I）+ electron smoke MCP 段绿（dev-app serialization 纪律）
- [ ] vitest 全绿（env -u 纪律）+ typecheck/eslint touched 绿

**Background（取证）:** writeJevSemanticSearchConfig 写 settings.jev 入 .pi/mcp.json（或全局等价物）；PiCode 合并模型只读 mcpServers/mcp-servers 键（mcp-management.ts:195,213）；deriveServerEntryWrite/Remove「unknown keys preserved」（`{ ...rawDoc }` 展开后只动 servers 键）——jev 配置与 PiCode 编辑共存零破坏（intake 已实证）。语义搜索运行时在 PiCode host 会话自动生效（adapter 扩展同载，零 PiCode 改动）。exposeResources 投影 = Q7-③ 裁决不入批（操作者未启用该设置，零差异；启用时仅显示保真缺口，运行时行为不受影响）。2.36/2.37 其余增量（/mcp jev 子命令、allowInstall 门、deferWithMissingMetadata、SYSTEMONE_ENDPOINT）对 PiCode 消费面不可见。证据索引见报告 §5。

**Red lines:** 不 push/不打 tag/不 release；无 IPC 增量；不碰 ~/.pi 环境。

**Blocked by:** 无。
