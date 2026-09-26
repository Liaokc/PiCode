# PiCode 1.8.2 — 依赖适配批 · 会话 Prompt 手册

> 本手册供**执行会话**驱使 subagent 执行全批使用：每票一个 worktree、一条分支、一个 worker subagent。
> 约定见 `AGENTS.md › Parallel development (git worktrees)`；契约见 `docs/agents/development-contract.md`。
> 总 spec：`.scratch/picode-1-8-2/spec.md`（R1 ↔ 票 149）。
> 需求全记录：`.scratch/picode-1-8-2/intake-grilling.md`（Round 1 Q1–Q4 + Round 2 定稿轮，裁决链完整）。
> 调研证据：`.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md`（2.37.0 → 2.38.0 全量 diff + 契约面核对表 §3 + 消费面逐项判定 §5 + 初判线索实证 §4——实施时按需引用其证据索引）。
> 本批**零 shared-contract 增量、无多模态票、无参照帧**；唯一 UI 变化 = 加/编辑对话框 `~/` 提示行（纯文本，票面给精确文案）。
>
> **模型分派（操作者原话，照抄）**：文本模型使用 bella-local/GLM-5.3，多模态模型使用 bella/GLM-5.3-flash，思考强度都使用 max。本批全票非多模态 → **每票 model = bella-local/GLM-5.3，thinking = max**。

## 环境前置（intake 已完成；执行会话只核对、绝不操作环境）

intake 交付执行 prompt 后已执行：`pi update --extensions`（pi-mcp-adapter → 2.38.0）+ 版本验证。执行会话开目第一步核对：

```bash
pi --version        # 期望 0.87.1
node -p "require(process.env.HOME + '/.pi/agent/npm/node_modules/pi-subagents/package.json').version"    # 期望 0.71.0
node -p "require(process.env.HOME + '/.pi/agent/npm/node_modules/pi-mcp-adapter/package.json').version"  # 期望 2.38.0
git worktree list   # 期望仅根
```

任一不符 → 停下报告操作者，勿自行升级。

## 执行会话开目动作（先落库后行动）

1. **run-log 开账**：新建 `.scratch/picode-1-8-2/run-log.md`（§0 指南 / §1 账本 / §2 检查点…；恢复唯一入口 = 重读 run-log；每次行动前先写账）。
2. **work-notes 目录**：`.scratch/picode-1-8-2/work-notes/`（跨工区可见；收尾 git add 作证据）。
3. **spawn 自检**：能 spawn subagent 才开工。
4. **基线 tag**（若缺）：`git tag -a picode-1-8-2-base -m "1.8.2 baseline: v1.8.1 shipped + 1.8.2 spec/tracker" main`
5. **merge-gate 补位**：`scripts/merge-ticket.sh:50` 的 ls-files 列表追加 `".scratch/picode-1-8-2/issues/${NN}-*.md"`（沿 picode-1-0…1-8-1 先例），提交 main。
6. **环境核对**（上节命令）。

## Linear 镜像账（状态变化即同步，issue-tracker.md 纪律）

| 票 | Linear | 起步状态 |
|---|---|---|
| 149 | **LIA-214** | Todo（iter:1.8.2） |

派工 → In Progress；评审记录追加描述；合并 → Done（附 merge sha + 验证记录）。

## 波次表

| 波 | 票 | 说明 |
|---|---|---|
| W1 | **149**（单票） | 全批唯一工单：fidelity 注释 ×2 + McpSection 提示行 + smoke 段复核；无并行票 |
| 收尾 | 全量回归（vitest env -u + `npm run smoke` 全套 + `npm run package:verify`）+ 总报告 + 手截对话框帧 | 执行会话 |

合并纪律：评审过即从根工作区 `bash scripts/merge-ticket.sh 149` 合入 main（merge fast）。

---

## T149 — adapter 2.38 fidelity + stdio `~/` 提示（W1 · 全批唯一票）

```bash
cd ~/PiCode
git worktree add .worktrees/wt-149-mcp-238 -b t149-mcp-238-fidelity main
cd .worktrees/wt-149-mcp-238 && npm install
```

**Worker prompt（model: bella-local/GLM-5.3 · thinking: max）**：

```text
/implement .scratch/picode-1-8-2/issues/149-mcp-238-fidelity.md

规矩：CONTEXT.md 是术语权威（MCP 节词条）；docs/adr/ 0001–0006 有效；1.8.2 总 spec 在
.scratch/picode-1-8-2/spec.md；调研证据在
.scratch/picode-1-8-2/research/pi-mcp-adapter-2.38.0-diff.md。你当前在 worktree 分支
t149-mcp-238-fidelity。绝不碰 ~/.pi 环境。

核心：①src/shared/mcp-management.ts:9 与 src/shared/mcp-status.ts:10 fidelity 注释
2.37.0 → 2.38.0 + 各插入 2.38 重验注记（票面给要点：合并/写器逐行未变 + README:76 引语
在案 + OpenCode v2/ancestorConfigRoots 属 host-import 面永不镜像；~/ 展开为运行时 spawn
行为文件层不展开显示保真成立；mcp-status.ts 字节相同 + version 1/频道未 bump + 转正与
keep-alive 不触碰快照形状）；历史叙述保留、最小改动。②McpSection.tsx 加/编辑对话框
stdio 分支末尾（Environment 字段后）加一行 settings-mcp-form-note 提示，文案精确为
"Tip: paths starting with ~/ are supported in the command and arguments (expanded
when the server starts)."——零新 CSS、仅 stdio 分支渲染。③MCP smoke 段复核（用户级
adapter 应已 2.38.0）：npm run smoke:host 全套 + npm run smoke:electron 全套（MCP 段
16 断言 + OAuth 双腿；跑前 ps 自查 dev-app serialization，占用则 sleep 60 重试上限
30 分钟）。

验收（票面为准）：两处注释 + 提示行在案；smoke:host / smoke:electron 全套 PASS；
vitest 全绿（env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u
PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT）；typecheck + eslint touched；除三处目标
文件外零源码改动。

完成即提交分支，停下等评审；不合并（合并归执行会话根工作区
scripts/merge-ticket.sh 149）；Linear 由执行会话镜像，你不管。
```

---

## 收尾 — 全量回归 + 总报告（执行会话）

```bash
cd ~/PiCode   # 根工作区，main 应已含 149 合并
npm install   # 根 node_modules 同步（若未同步）
env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT npm test   # vitest 全绿
npm run smoke         # 全套（dev-app serialization：独占窗口跑；安静环境）
npm run package:verify  # PACKAGED ARTIFACT VERIFIED
```

**截图项（T149 UI 可见改动）**：加/编辑对话框 stdio 分支的 `~/` 提示行——对话框不在 `visual:settings` harness 覆盖内，执行会话**手截**：dev/打包 app 打开 Settings → MCP → Add a project server（stdio 分支），截含提示行的对话框帧，存 `.scratch/picode-1-8-2/reference/`，总报告给出绝对路径（dev-app serialization 纪律照旧）。

报告要求（每票）：merge sha / 评审方式（双轴或 fallback self-review + 标注）/ 验收结论 / 遗留风险；收尾两件套：**任务陈述**（一句话答「这批工单的任务是什么」）+ **截图项**（对话框帧绝对路径）。Linear 全镜像（LIA-214 Done + 验证记录）。

遗留候选（归操作者，不自开票）：1.8.1 四项（cost RPC 桥接 / started 转发 / exposeResources 投影 / jev setup UI）+ SDK 0.87 新能力跟进 + 2.38 其余新能力（无消费面）——盘点见 spec「不做面」与 research 报告 §8-C。

发版（操作者）：版本 bump 1.8.2 → tag → push → /Applications 替换——归操作者，执行会话不做。
