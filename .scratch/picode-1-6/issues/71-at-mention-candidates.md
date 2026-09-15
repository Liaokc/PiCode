# 71: @ 候选集升级——git ls-files + truncated 提示

**What to build:** @ 文件补全的候选集修复：会话 cwd 在 git 仓库内时候选来自 **git ls-files**（只读、全量、快——大仓库 `@ts` 不再必空，对照 pi16-at-no-match）；非 repo 维持既有目录 walk + cap（深度/条数上限不变）；cap 截断时候选列表尾附一行 **"truncated"** 提示（诚实降级——空结果可解释）；匹配/排名的渲染层规则不变；@ 菜单与斜杠菜单共用 68 的触发面规则。git 只读复用 branch_info 先例（零写入）。

**背景（取证）：** host 候选集走目录 walk，cap 1500 条/深度 8/目录字母序 DFS——家目录等大目录在字母序靠前目录耗尽 cap，后面的文件永远进不了候选；`@ts` 在此类 cwd 必然 "No matching files"（pi16-at-no-match 实锤）。Pi 原生支持 @ 路径补全（SDK docs extensions.md 内置 path provider）——@ 保留、语义锁定 path completion；**插件/会话分类不做**（Pi 无消费面——MCP 出局同款纪律）。file:line 级根因见 `../intake-grilling.md` R12 节。

**Blocked by:** 70（Lane A 串行位次）.

**Status:** ready-for-agent

- [ ] host-contract smoke：repo 内（git ls-files 候选）/ 非 repo（walk+cap）两态
- [ ] git 零写入确认（只读；submodule/worktree 场景不炸）
- [ ] 大目录场景 @ 命中（对照 pi16-at-no-match 场景重建）
- [ ] truncated 提示行仅 cap 截断时出现；匹配/排名不回归
- [ ] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
