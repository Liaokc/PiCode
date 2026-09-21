# 134: Finder/Dock 启动也能 spawn subagent——PATH 合成 + 捆绑 SDK 对齐（本批最后实现）

**What to build:** 从 Finder/Dock 正常启动的 PiCode 里，会话内 spawn pi-subagent 能工作。**双根因子，双修复**——全部落在 `~/PiCode` 源码、随 v1.8.0 上线（**不碰已安装/已发版的 app bundle**）：

①**PATH 合成**：主进程启动早期（缓存一次、超时与失败降级）合成子进程 spawn 用的 PATH——`$SHELL -lc 'echo $PATH'` 登录 shell 快照 + 静态探测常见 node 安装点（`~/.nvm/versions/node/*/bin` 当前版本、`/usr/local/bin`、`/opt/homebrew/bin`、`~/.pi/agent/bin`），注入所有需要 PATH 的子 spawn（subagent 子进程；会话 host 如涉及同样注入）。**LSEnvironment 否决**（PATH 机器相关，不能烧进通用 bundle）；探测不阻塞窗口就绪（异步初始化，票内裁量）。

②**捆绑 SDK 对齐核验**：spawn 链依赖捆绑 SDK 的能力面——实测瓶颈 = app 捆绑 pi-ai 0.85.1 **没有 transcript 工具导出（0.86.1 才有）**，pi-subagents 0.70.1 的 review.js 需要它。修复 = 确保 app 实际捆绑的 SDK/pi-ai 为 0.86.1（package.json pin 已 0.86.1；npm install 同步 node_modules/lock；打包链核验产物内版本）+ 启动期版本自检（票内裁量：SDK < 0.86.1 与 pi-subagents ≥ 0.70 组合时如实提示，不静默失败）。

**测试方法（操作者指定）：** 用「**从 Finder/Dock 启动 PiCode → 其中的会话 spawn pi-subagent**」作为测试全流程：①**定位** = Finder/Dock（或净化环境等效：`env -i HOME=… PATH=/usr/bin:/bin:/usr/sbin:/sbin` 直启二进制）启动 → 应用内会话 spawn 失败现场 + 插桩两根因子分别实证（PATH 断点 + SDK 导出缺失断点）；②**修复后同条件复测** → spawn 成功。可自动化部分进 electron smoke（sanitized-env 启动 + 应用内 spawn 腿）；Finder/Dock 实启最终确认留操作者（验收记录模板：启动方式 / spawn 结果 / 版本事实三要素）。

**实现时点：本批最后实现（116–133 全部合并后）**——验证要带着批次全部修复启动 app；批次运行自身（Pi Agent 主会话）不依赖本票。

**背景（取证）：** 两轮自治批次空跑实证。第一轮定位 PATH 因子（GUI 启动不继承 shell PATH；workaround = 终端带 nvm PATH 启动即通）。第二轮（PATH workaround 已生效仍失败）深挖出第二因子——**app 捆绑 pi-ai 0.85.1 缺 transcript 工具导出，pi-subagents 0.70.1 的 review.js 需要它（0.86.1 才有）**。node_modules 实装 0.85.1 = 批次开场已记录的「npm install 未跑」缺口——本票把「捆绑版本正确」从环境前提升格为本票验收项。操作者原话：「不是已经发版的代码，而是 ~/PiCode 内部的相关代码，这个修复在 v1.8.0 上线」。

**Blocked by:** 116–133 全部合并（本批最后实现）.

**Status:** ready-for-agent

## Acceptance

- [ ] **插桩定位 = 第一验收项，双因子分别实证**：Finder/Dock（或净化环境等效）启动的实例里——PATH 断点（哪个进程找哪个可执行失败）+ SDK 导出缺失断点（pi-subagents review.js 需要的导出在捆绑版本缺席）留档
- [ ] Seam-1：PATH 合成纯函数表驱动（登录 shell 快照 / 静态探测点 / 去重与顺序 / 失败降级 / 已有良好 PATH 时不劣化）
- [ ] electron smoke：sanitized-env 启动 + 应用内 spawn subagent 成功腿；正常 PATH 启动不回归
- [ ] 捆绑版本核验：dev node_modules 与打包产物内 SDK/pi-ai = 0.86.1（断言或探针）；启动自检如实提示（若做，不静默失败）
- [ ] 手工验收记录模板：操作者 Finder/Dock 实启 → 应用内 spawn 成功（修复以新启动实例为限——运行中实例不热更，边界记 Comments）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 6)：P28 定稿 R21（PATH 因子，单因子口径）。
- 2026-09-22 (Round 7 修订)：第二空跑（workaround 已生效仍失败）实证第二根因子——捆绑 pi-ai 0.85.1 缺 transcript 导出、pi-subagents 0.70.1 review.js 需要。操作者裁决三项：①134 移至**批次最后实现**；②测试 = Finder/Dock 实启 + 应用内 spawn 全流程；③修复落 `~/PiCode` 源码、随 v1.8.0 上线（不碰已发版 bundle）。原文保留第一轮口径备查：PATH 合成 + LSEnvironment 否决 + 复现纪律（workaround 实例 spawn 可用是预期现象）——全部继续有效。
