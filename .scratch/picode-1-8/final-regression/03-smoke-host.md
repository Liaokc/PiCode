# 终验日志 — 步骤 4：smoke:host（host-contract）

- 命令：`npm run smoke:host`（第一次）/ 重跑一次（按任务书指令）

## 第一次跑（/tmp/final-regression-smoke-host.log，exit 1）
- Round A（ticket-104 mid-run rename/abort）ok
- Round B/C（resume same file、history usage）ok
- Round D（ticket-71 non-repo walk+cap）ok
- Round E/E2（ticket-80 legacy/accessMode sentinel）ok
- Round F（ticket-79 image projection + edit-resend）ok
- Round G（ticket-89 MCP OAuth bridge）ok
- Round H（ticket-90 subagent bridge）ok
- Round I（ticket-96 MCP status projection）ok
- Round J（ticket-99 subagent steer）ok
- **Round K（ticket-101 subagent stop）：死**
  - 失败点：`SMOKE FAIL the live stop must be accepted with state stopping, got {"type":"subagent_stop_receipt","requestId":"sub101-stop-2","asyncId":"sub101-run-1","ok":false,"error":"the stop request timed out (pi-subagents did not answer)"}`
  - 即 live stop 被报为超时未被接受（期望 state=stopping）

## 重跑（/tmp/final-regression-smoke-host-retry.log，exit 1）
- Round A：ticket-104 mid-run rename ok，随后 `SMOKE FAIL step 'A agent_end 1' timed out after 90000ms`（abort 后 agent_end 未落地）

## 结论
两次死点（Round K live-stop 超时、Round A agent_end 超时）均在任务书已知的 **t131/t134 留档 flaky 族**（stash 基线同死）内，按指令**记录为已知 flaky 不追**。其余所有到达的 round（A/B/C/D/E/E2/F/G/H/I/J + K 的前半段）全部 ok；两次失败点互不相同的超时形态与 flaky 族特征一致。
