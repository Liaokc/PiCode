# 71: @ 候选集升级——git ls-files + truncated 提示

**What to build:** @ 文件补全的候选集修复：会话 cwd 在 git 仓库内时候选来自 **git ls-files**（只读、全量、快——大仓库 `@ts` 不再必空，对照 pi16-at-no-match）；非 repo 维持既有目录 walk + cap（深度/条数上限不变）；cap 截断时候选列表尾附一行 **"truncated"** 提示（诚实降级——空结果可解释）；匹配/排名的渲染层规则不变；@ 菜单与斜杠菜单共用 68 的触发面规则。git 只读复用 branch_info 先例（零写入）。

**背景（取证）：** host 候选集走目录 walk，cap 1500 条/深度 8/目录字母序 DFS——家目录等大目录在字母序靠前目录耗尽 cap，后面的文件永远进不了候选；`@ts` 在此类 cwd 必然 "No matching files"（pi16-at-no-match 实锤）。Pi 原生支持 @ 路径补全（SDK docs extensions.md 内置 path provider）——@ 保留、语义锁定 path completion；**插件/会话分类不做**（Pi 无消费面——MCP 出局同款纪律）。file:line 级根因见 `../intake-grilling.md` R12 节。

**Blocked by:** 70（Lane A 串行位次）.

**Status:** ready-for-human

- [x] host-contract smoke：repo 内（git ls-files 候选）/ 非 repo（walk+cap）两态
- [x] git 零写入确认（只读；submodule/worktree 场景不炸）
- [x] 大目录场景 @ 命中（对照 pi16-at-no-match 场景重建）
- [x] truncated 提示行仅 cap 截断时出现；匹配/排名不回归
- [x] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-16（implement session，branch t71-at-candidates）：**host 候选集双态** `src/host/files.ts`——新增 `listMentionCandidates(root)`：cwd 能答 git 即走只读 `git ls-files -z --cached --others --exclude-standard`（branch_info 先例：零写入、5s 超时、64MB maxBuffer，任何失败——非 repo/无 git/超时/缓冲溢出——静默降级 walk；`--cached`+`--others` = 跟踪+未跟踪未忽略，agent 刚写的新文件不丢；`--exclude-standard` 吃 .gitignore；`-z` 免 quote 乱码；路径相对 cwd，子目录/worktree 语义正确），答不上维持既有 walk+cap（深度 8/条数 1500 不动）。**walk 补 truncated 旗标**：走查停在条数 cap 即 true（诚实语义「扫到 cap 停」——不越过 cap 扫描否则 cap 失义；深度截断属结构性，不置旗）；git 路径恒 false（repo 答案全量）。**零契约截断标记**（grilling R12「R12 零契约」定稿）：`contract.ts` 导出 `FILE_LIST_TRUNCATED = '\u0000truncated'`——NUL 前缀文件名不可能含，永不与真路径碰撞；host 在 `handleListFiles` 截断时尾附；`mention.ts` 新增 `splitTruncatedFiles`（composer 收到 `file_list` 即剥，标记永不入 `filterFiles`/菜单行）；`FileMenu` 增 `truncated?` prop——listbox 外尾附一行 `truncated`（`.cmp-menu-truncated`，非可选行、键盘永不到达，零匹配无菜单时自然无处显——68 规则不变）。**渲染匹配/排名零改动**（filterFiles 原样）。host-contract smoke 双态：round A repo 态断言（1504 候选 = tracked+untracked、ignored-dir 排除、**pi16-at-no-match 重建命中**——aaa/ 1500 文件耗尽 cap 后 zzz/target.ts 照样上榜、无标记、**.git/index 字节前后一致 = 零写入实锤**）+ 新 round D 非 repo 态（独立 cwd 永不 git init：cap 截 zzz/late.txt、恰 1500 行 + 尾标记）；无 git 环境下 round A 自动退化为 walk 态断言。单测：host-files 11 行（git 态/子目录相对路径/worktree/**submodule**（protocol.file.allow 本地 clone）/降级/零写入/truncated 旗标两态）、composer-mention 增 splitTruncatedFiles 6 行。

- 2026-09-16（code-review 两轴，无 sub-agent 环境——两轴独立走查后汇总）：**Standards 轴**：发现 handleGetBranch 注释「the one git interaction this host ever makes」被本票作废（host 现有两次 git 只读交互）→ 已改「one of the host's two git interactions」；judgement call 两条受理不改——① execFileP 在 git-branch.ts / files.ts 各声明一次（抽共享模块需动 ticket-21 代码，并行工单期 rebase 风险大于一行重复）；② 截断旗标用 in-band 字符串（Primitive Obsession 形态）系 grilling R12「零契约」定稿的刻意编码，NUL 前缀排除碰撞，注释已留档。其余达标：命名、{files,truncated} 聚成 CandidateFiles、无 Speculative Generality、契约 additive-only（零形状变更）、Seam 纪律（host 逻辑在 src/host、纯剥标在 src/shared、FileMenu 保持 presentational）、UI 文案全英文、renderer 不碰 SDK。**Spec 轴**：验收项全覆盖，发现 submodule 场景缺证据 → 补单测（本地 protocol.file.allow clone，从 submodule repo 作答、父 repo 不炸）；无 scope creep（「候选尾附 truncated」即票面机制，零契约编码循定稿）。

- 2026-09-16（verification）：vitest 1408/1408 全绿（93 文件，含新增 host-files 11 行 + mention 6 行）；typecheck 双 tsconfig 干净；`node scripts/smoke/host-contract-smoke.mjs`（build 后真跑）SMOKE PASS 全链——round A 真模型调用（abort/tool gate/remember/read-only/deny/queue/steer 全轮）+ ticket-71 两态：`repo candidates ok (git ls-files: 1504 paths, tracked+untracked, ignored excluded, pi16 hit)`、`git zero-write ok (index bytes unchanged)`、round D `non-repo walk+cap ok (cap cut zzz, marker at tail, honest degradation)`。smoke 前后 ps 自查执行（serialization 生效）；本轮 host-contract smoke 运行中途 wt-80 起了 electron dev app——本 smoke 纯 Node host fork（无 Electron、无 dev-server 端口），已顺利收尾，此后未再占 dev-app 位。临时 smoke cwd 已清理。electron smoke / visual 未跑（dev-app 位被 wt-80 占用 + 本票验收面在 host-contract smoke，renderer 侧仅 additive prop + CSS，vitest + typecheck 覆盖）。**操作者：`bash scripts/merge-ticket.sh 71`。**
