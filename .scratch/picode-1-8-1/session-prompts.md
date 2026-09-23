# PiCode 1.8.1 — 依赖升级批 · 会话 Prompt 手册

> 本手册供**执行会话**驱使 subagent 执行全批使用：每票一个 worktree、一条分支、一个 worker subagent。
> 约定见 `AGENTS.md › Parallel development (git worktrees)`；契约见 `docs/agents/development-contract.md`。
> 总 spec：`.scratch/picode-1-8-1/spec.md`（R0–R3 ↔ 票 144/146/147/148）。
> 需求全记录：`.scratch/picode-1-8-1/intake-grilling.md`（R0 转向 + Round 1–2 + Q7 细化轮，裁决链完整）。
> 调研证据：`.scratch/picode-1-8-1/research/`（SDK 0.87.1 / pi-subagents 0.71.0 / pi-mcp-adapter 2.37.0 三份 diff 报告——实施时按需引用其证据索引）。
> 本批**零 shared-contract 增量、无多模态票、无参照帧、无 UI 视觉变化**。
>
> **模型分派（操作者原话，照抄）**：思考强度使用 max；非多模态票的模型使用 bella-local 的 GLM-5.3；需要多模态的票使用 bella 的 GLM-5.3-flash。本批全票非多模态 → **每票 model = bella-local/GLM-5.3，thinking = max**。

## 环境前置（intake 已完成；执行会话只核对、绝不操作环境）

intake 交付执行 prompt 后已执行：`pi update`（self → 0.87.1）+ `pi update --extensions`（pi-subagents → 0.71.0、pi-mcp-adapter → 2.37.0）。执行会话开目第一步核对：

```bash
pi --version        # 期望 0.87.1
node -p "require(process.env.HOME + '/.pi/agent/npm/node_modules/pi-subagents/package.json').version"    # 期望 0.71.0
node -p "require(process.env.HOME + '/.pi/agent/npm/node_modules/pi-mcp-adapter/package.json').version"  # 期望 2.37.0
git worktree list   # 期望仅根
```

任一不符 → 停下报告操作者，勿自行升级。

## 执行会话开目动作（先落库后行动）

1. **run-log 开账**：新建 `.scratch/picode-1-8-1/run-log.md`（§0 指南 / §1 账本 / §2 检查点…；恢复唯一入口 = 重读 run-log；每次行动前先写账）。
2. **work-notes 目录**：`.scratch/picode-1-8-1/work-notes/`（跨工区可见；收尾 git add 作证据）。
3. **spawn 自检**：能 spawn subagent 才开工。
4. **基线 tag**（若缺）：`git tag -a picode-1-8-1-base -m "1.8.1 baseline: v1.8.0 shipped + 1.8.1 spec/tracker" main`
5. **merge-gate 补位**：`scripts/merge-ticket.sh:50` 的 ls-files 列表追加 `".scratch/picode-1-8-1/issues/${NN}-*.md"`（沿 picode-1-0…1-8 先例），提交 main。
6. **环境核对**（上节命令）。

## Linear 镜像账（状态变化即同步，issue-tracker.md 纪律）

| 票 | Linear | 起步状态 |
|---|---|---|
| 144 | **LIA-205** | Todo（iter:1.8 + iter:1.8.1） |
| 146 | **LIA-211** | Todo |
| 147 | **LIA-212** | Todo |
| 148 | **LIA-213** | Todo |

派工 → In Progress；评审记录追加描述；合并 → Done（附 merge sha + 验证记录）。

## 波次表

| 波 | 票 | 说明 |
|---|---|---|
| W1 | **144 · 146 · 148**（并行，≤3） | 文件面零重叠（harness / package.json+tests+package.mjs / shared 注释+tests）；**smoke 面遵 dev-app serialization**（ps 自查 + sleep 60 重试，上限 30 分钟） |
| W2 | **147** | Blocked by 146（package.json 重叠 + 探针活跑依赖捆绑 SDK 0.87.1） |
| 收尾 | 全量回归（vitest env -u + `npm run smoke` 全套 + `npm run package:verify`）+ 总报告 | 执行会话 |

合并纪律：每票评审过即从根工作区 `bash scripts/merge-ticket.sh NNN` 合入 main（merge fast）；其余活跃 worktree 逐个 `git rebase main`。

---

## T144 — forkHost env-strip（W1 · harness 微票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-144-forkhost-env -b t144-forkhost-env main
cd .worktrees/wt-144-forkhost-env && npm install
```

**Worker prompt（model: bella-local/GLM-5.3 · thinking: max）**：

```text
/implement .scratch/picode-1-8/issues/144-forkhost-env-strip.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效；1.8.1 总 spec 在
.scratch/picode-1-8-1/spec.md。你当前在 worktree 分支 t144-forkhost-env。

核心：scripts/smoke/host-contract-smoke.mjs 的 forkHost()（约 408-415 行）spawn env
剥离 PI_SUBAGENT_CHILD 与 PI_SUBAGENTS_HERDR_BRIDGE（与 src/main/spawn-path.ts
hostForkEnv 同语义：host fork 是顶层进程永非 child）。可选：run-all.sh 的
host-contract 步启动侧同步净化。只动 harness，产品/shared 零改动。

验收（票面为准）：从携带 PI_SUBAGENT_CHILD=1 的环境驱动 npm run smoke:host 全套
PASS exit 0（不再需要 env -u 前置）；干净 env 跑照常绿；vitest（env -u
PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE）全绿；eslint touched。
smoke 跑前 ps 自查 dev-app serialization（占用则 sleep 60 重试，上限 30 分钟）。

完成即提交分支，停下等评审；不合并（合并归执行会话根工作区
scripts/merge-ticket.sh 144）；Linear 由执行会话镜像，你不管。
```

---

## T146 — SDK 0.87.1 bump（W1 · 主票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-146-sdk-bump -b t146-sdk-bump main
cd .worktrees/wt-146-sdk-bump && npm install   # 先装旧锁，改完 package.json 再 npm install 同步
```

**Worker prompt（model: bella-local/GLM-5.3 · thinking: max）**：

```text
/implement .scratch/picode-1-8-1/issues/146-sdk-bump-0871.md

规矩：CONTEXT.md 是术语权威；docs/adr/ 0001–0006 有效（ADR-0005 锁版纪律）；
1.8.1 总 spec 在 .scratch/picode-1-8-1/spec.md；调研证据在
.scratch/picode-1-8-1/research/sdk-0.87.1-diff.md。你当前在 worktree 分支
t146-sdk-bump。

核心：①package.json:72 锁版 0.86.1 → 0.87.1（精确，无范围）；②npm install
（ELECTRON_MIRROR 备用）同步 node_modules 与 package-lock.json；③
tests/main/bundled-sdk-versions.test.ts 断言字面量与头注更新（pi-ai >=0.86.1
地板断言维持原值——地板守 pi-subagents 0.70.x 旧装）；④scripts/package.mjs:69-70
注释 pinned 0.87.1（代码动态读，零功能改动）。绝不碰 ~/.pi 环境。

验收（票面为准）：vitest 全绿（env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE）；
typecheck + eslint touched；npm run smoke 全套六阶段 PASS（含 interop 双向——
全局 TUI 0.87.1 × 捆绑 0.87.1 会话互开；smoke 跑前 ps 自查 dev-app serialization，
sleep 60 重试上限 30 分钟）；bundled-sdk-versions 三断言全绿。package:verify 可留
批次收尾门。

完成即提交分支，停下等评审；不合并；Linear 由执行会话镜像。
```

---

## T148 — adapter 2.37 fidelity（W1）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-148-mcp-fidelity -b t148-mcp-fidelity main
cd .worktrees/wt-148-mcp-fidelity && npm install
```

**Worker prompt（model: bella-local/GLM-5.3 · thinking: max）**：

```text
/implement .scratch/picode-1-8-1/issues/148-mcp-237-fidelity.md

规矩：CONTEXT.md 是术语权威（MCP 节词条）；1.8.1 总 spec 在
.scratch/picode-1-8-1/spec.md；调研证据在
.scratch/picode-1-8-1/research/pi-mcp-adapter-2.37.0-diff.md。你当前在 worktree
分支 t148-mcp-fidelity。

核心：①src/shared/mcp-management.ts:9 与 src/shared/mcp-status.ts:10 fidelity 注释
2.35.0 → 2.37.0 + 重验注记（合并规则逐行未变仅外包 applySettingDefaults、快照 v1
未 bump、OAuth 流未变、jev settings.jev 共存）；②扩展
tests/shared/mcp-management.test.ts 既有 settings 用例——层文档带 settings.jev 时
parse 保留、mergeMcpLayers 只读服务器条目、deriveServerEntryWrite/Remove 写后
settings.jev 幸存；③MCP smoke 段复核（host-contract Round G/I + electron smoke
MCP 段含 OAuth 双腿）在用户级 2.37.0 下全绿。绝不碰 ~/.pi 环境。

验收（票面为准）：两处注释更新；jev 共存单测绿；smoke:host 全套 PASS + electron
smoke MCP 段绿（dev-app serialization 纪律）；vitest 全绿（env -u）；typecheck/
eslint touched。

完成即提交分支，停下等评审；不合并；Linear 由执行会话镜像。
```

---

## T147 — subagents 0.71 探针升位（W2 · Blocked by 146）

> 前置核对：146 已合入 main（`git log --oneline main | head` 可见 merge: t146）。

```bash
cd ~/PiCode
git worktree add .worktrees/wt-147-subagents-071 -b t147-subagents-071 main
cd .worktrees/wt-147-subagents-071 && npm install   # node_modules 应装 SDK 0.87.1
```

**Worker prompt（model: bella-local/GLM-5.3 · thinking: max）**：

```text
/implement .scratch/picode-1-8-1/issues/147-subagents-071-probe.md

规矩：CONTEXT.md 是术语权威（子智能体目录等词条）；1.8.1 总 spec 在
.scratch/picode-1-8-1/spec.md；调研证据在
.scratch/picode-1-8-1/research/pi-subagents-0.71.0-diff.md。你当前在 worktree
分支 t147-subagents-071；worktree node_modules 应已装捆绑 SDK 0.87.1（核对
node_modules/@earendil-works/pi-coding-agent/package.json）。

核心：①git mv scripts/smoke/subagents-070-probe.ts → subagents-071-probe.ts，头注
改写 0.71（含三个行为注记：dev 动态激活 loader 先行/worker 默认 fresh/task-goal
脱敏）；②package.json 脚本 smoke:subagents070 → smoke:subagents071（outfile
probe071.mjs）；③src/host/subagent-bridge.ts:58 注释探针路径同步；④补断言：
ping.capabilities.cost={version:1}、status.json steps[].externalProcess census
（presence-tolerant）、可选 cost RPC 版本化信封校验；⑤内部 tmp 前缀 probe070 →
probe071；⑥src/main/index.ts:813 与 src/shared/subagent-sdk-alignment.ts 头注补
「0.71.0 已删硬导入、地板常量维持」一句。绝不碰 ~/.pi 环境。

验收（票面为准）：npm run smoke:subagents071 PASS exit 0（活跑：用户级 0.71.0 ×
捆绑 0.87.1）；cost 断言 + externalProcess census 在位；全仓无 subagents070/
probe070 残留（grep 干净）；vitest 全绿（env -u）；typecheck/eslint touched。

完成即提交分支，停下等评审；不合并；Linear 由执行会话镜像。
```

---

## 收尾 — 全量回归 + 总报告（执行会话）

```bash
cd ~/PiCode   # 根工作区，main 应已含 144/146/147/148 全部合并
npm install   # 根 node_modules 同步 0.87.1（若未同步）
env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE npm test   # vitest 全绿
npm run smoke         # 全套六阶段（dev-app serialization：独占窗口跑）
npm run package:verify  # PACKAGED ARTIFACT VERIFIED（产物 SDK=0.87.1）
```

报告要求（每票）：merge sha / 评审方式（双轴或 fallback self-review + 标注）/ 验收结论 / 遗留风险；收尾两件套：**任务陈述**（一句话答「这批工单的任务是什么」）+ **截图项**（本批纯依赖/桥/探针面，无 UI 可截图——如实标注不适用）。Linear 全镜像（四票 Done + 验证记录）。

遗留候选（归操作者，不自开票）：四项可选项（cost RPC 桥接 / started 转发 / exposeResources 投影 / jev setup UI）+ SDK 0.87 新能力跟进——盘点见 research 报告与 spec「不做面」。

发版（操作者）：版本 bump 1.8.1 → tag → push → /Applications 替换——归操作者，执行会话不做。
