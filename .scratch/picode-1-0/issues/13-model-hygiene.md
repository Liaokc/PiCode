# 13: 模型用量数据卫生——冒烟隔离 + 大小写归一

**What to build:** 让用量统计只反映真实使用。冒烟测试产生的会话不再写入 `~/.pi/agent/sessions`（改用隔离的 agentDir 或 `--no-session`）；聚合器对 model 标识按大小写不敏感分组（展示保留首次出现的原拼写），使 `GLM-5.3-flash` 与网关回显的 `glm-5.3-flash` 永远折叠为同一个模型。

**背景**：实测发现真实用量（大写，$32.93/2.55 亿 tokens，provider bella）与冒烟测试消耗（小写回显，$0.15，散布于 33+ 个 `picode-smoke-*` 临时会话目录）被当成两个模型分开统计。根因不是配置（models.json 仅一条大写条目），而是 (a) 冒烟工装直接写共享会话库、(b) 聚合分组未归一大小写。

**Blocked by:** 12 终局 QA（工装文件 `scripts/smoke/*` 正被 T12 会话编辑，合并后再动，避免活体冲突）。T12 已 resolved，本工单开工。

**Status:** resolved

- [x] 跑完整冒烟套件前后，`~/.pi/agent/sessions` 下会话文件数量零增长（自动化检查内置于 `scripts/smoke/run-all.sh`：起跑前后各统计一次 `*.jsonl`，数量变化即套件 FAIL；本轮实测 ALL GREEN 且 132 → 132）
- [x] 聚合器单元测试：同一模型两种大小写的 usage 事件折叠为一个分组，tokens/cost 相加（`tests/usage/casefold.test.ts` 全缝覆盖：fold 内折叠、跨文件合并、时间戳定展示拼写、trend 单线、与不同模型互不误折；`tests/usage/store.test.ts` 覆盖增量追加路径）
- [x] usage CLI 对当前真实库输出单一 `GLM-5.3-flash` 条目（大写展示），tokens/cost 为两来源之和（实测 `npm run usage:scan`：单条 GLM-5.3-flash，~2.7 亿 tokens，~$35.03，即原两条之和）
- [x] 存量污染处理策略明确记录（见 Comments：一次性清洗脚本，dry-run 默认，`--yes` 才删除；决策已记录，删除动作待操作者批准后自行执行）

## Comments

- 2026-08-31: implemented on `t13-model-hygiene`, head `b99016c` (2 commits).
- **Operator decision recorded — legacy pollution strategy: option (b), one-time cleanup script.** Rationale: keeping the smoke sessions identifiable (option a) would leave the lowercase `glm-5.3-flash` noise in every future usage number forever, against the ticket's own goal ("用量统计只反映真实使用"); the directories are unambiguously tooling-created (`picode-smoke-*` / `picode-lifecycle-smoke` / `picode-probe` / `picode-diff-e2e-*`, 37 dirs / 40 session files on this machine). Delivered as `scripts/cleanup-smoke-sessions.ts` with **dry-run default** — nothing is deleted until the operator runs `node scripts/cleanup-smoke-sessions.ts --yes` after reviewing the printed list. Decision made early per ticket instruction; overriding to option (a) requires no code — just don't run the deletion.
- **Isolation design note (ticket offered "isolated agentDir or --no-session"): chose a third, narrower variant — an isolated SESSION dir** via `PICODE_SESSION_DIR`. Full agentDir isolation would break the smoke's own preconditions (auth/models/settings live in the real `~/.pi/agent`; copying auth in adds refresh-token drift risk); `--no-session` would break the resume/rename/tree/fork assertions the contract smoke exists to protect. An isolated session dir keeps auth real (red line intact: nothing outside this repo is written) while every session write — fresh create, in-host fork (inherits the manager's session dir), and the electron app smoke's simulated TUI turn — lands in the throwaway store. The app's session index honors the same env so the stage-6 sidebar assertions stay intact. Resume hosts open the explicit file; the file's own parent dir keeps in-host branches isolated too.
- **Aggregation design:** model ids fold case-insensitively (`normalizeModelId`); per-file folds carry `modelDisplay` — the chronologically first raw spelling per normalized id, with an order-independent `(firstTs, raw)` tie-break so rescans stay byte-identical. The store's incremental chunks and the cross-file snapshot merge share one `mergeModelDisplay` helper (code-review finding: duplicated merge loop). Display spelling is applied at the snapshot boundary (modelTotals, daily `byModel`, sessionDays `byModel`, trend series) so donut/trend/drill-down all join on the same strings; internal fold keys stay normalized. On the real library the earliest event is the uppercase local spelling (08-27) predating the gateway echo (08-28), so display = `GLM-5.3-flash` as the acceptance requires.
- Verified: typecheck/lint clean, 456 vitest tests green (49 files; new: casefold suite + store incremental case-append + cleanup matcher). Full `npm run smoke` ALL GREEN (72s, 6 stages) with the new hygiene guard printing `session files unchanged (132)`; interop logs confirm host writes land inside `picode-smoke-sessions-*`. `npm run usage:scan` shows the single folded GLM-5.3-flash entry. Standalone smoke entry points (`smoke:host` / `smoke:interop` / `smoke:electron` / `package:verify`) self-isolate via the same env when the suite doesn't provide one.
- Follow-up for the operator (one command, whenever ratified): `node scripts/cleanup-smoke-sessions.ts` (review the list) → re-run with `--yes`.
- Merge from the root worktree: `cd ~/PiCode && git merge --no-ff t13-model-hygiene` (or `scripts/merge-ticket.sh 13`).
- 2026-08-28 (merge session): **resolved** — merged into main as `d84668b`（rebase 仅 tracker 预同步相撞，代码零冲突）。验收口径：操作者目检通过；**存量污染策略拍板 = 清洗**：合并会话已于当日从 ~/.pi/agent/sessions 删除 35 个 `*picode-smoke-*` 目录（57→22，模式零残留；实现会话的 dry-run 清洗脚本保留备用，未再需要）；另发现 4 个疑似同源残留（picode-lifecycle-smoke / picode-probe / picode-diff-e2e ×2）不在指令模式内，未动，待操作者示下。合并后 main 复核 49 文件 / 456 vitest 全绿。worktree 与分支已清理。
