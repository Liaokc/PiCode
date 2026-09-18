# 110: 双端包安装互通——Packages 列表挂载刷新 + 验证矩阵

**What to build:** 打通并验证「任一侧装 pi packages、两侧直接用」的完整链路：①**缓存盲区补齐**——Packages 节挂载/设置窗打开时 force 刷新列表（现状：per-dir 缓存无 TTL，force 仅在 PiCode 自家 op 后触发——**TUI 侧 `pi install` 之后 PiCode 列表不自动反映**）；②**双端验证矩阵**（electron smoke + 实测留档）：PiCode Packages 节安装 → `~/.pi/agent/settings.json` packages 数组断言 + TUI 下次启动可用；TUI `pi install` → PiCode 列表即时反映 + 新会话可用——真实包 pi-mcp-adapter / pi-subagents 就是现成测试对象；③**生效语义如实提示**——安装成功文案注明「新会话生效」（运行中会话不热加载；TUI 同语义需 /reload——两侧一致，不伪装）。

**背景（取证）：** 安装路径机制面已互通——Packages 节安装走 SDK `DefaultPackageManager.installAndPersist`（**与 `pi install` 完全同一代码路径**，落盘同一 settings.json packages 数组）；缺口 = `packages-service.ts` 列表 per-dir 缓存无 TTL，`force` 现仅自家 op 触发（`PackagesSection.tsx` 的 done/refresh(true) 路径），节挂载是 `refresh(false)`（命中缓存）。会话加载时机 = host 启动（两侧同语义）。

**Blocked by:** 89（MCP 管理节——真实测试对象之一挂在其 UI 上；同设置窗文件群）.

**Status:** ready-for-agent

## Acceptance

- [ ] Packages 节挂载/设置窗打开 → force 刷新（electron smoke：TUI 侧改 settings.json → 打开节 → 列表即时反映）
- [ ] 验证矩阵留档（electron smoke + 实测记录）：PiCode 装 → settings.json 断言；TUI 装（直接改文件或 `pi install`）→ PiCode 列表反映；新会话加载新包（包提供的 slash 命令/扩展可探针）
- [ ] 真实对象验证：pi-mcp-adapter / pi-subagents 在双端列表与加载面均正常（不重新安装，验证既有包的呈现）
- [ ] 安装成功文案含「新会话生效」语义（全英文）；失败 toast 不回归（票 64）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
