# 143: smoke:host Round L fixture 机器绝对路径卫生——播种时重写 session 头 cwd

**Status:** ready-for-agent

## What to build

smoke:host 的 Round L（ticket-112 pi-0.86 会话格式兼容段）播种 `tests/shared/fixtures/tui-086-session.jsonl`（真实 TUI 会话字节拷贝）。该 fixture 的 session 头 `cwd` = `/Users/liaokechen/PiCode/.worktrees/wt-105-terminal-focus`——**本机绝对路径，工区早已删除**。host 打开/恢复会话时校验存储 cwd 存在性（死 cwd = 保留 exit(1) 语义，票 123 沉底同源）→ Round L 必死于：

```
Stored session working directory does not exist: /Users/liaokechen/PiCode/.worktrees/wt-105-terminal-focus
```

当前人工规避 = 跑前在原路径建空目录、跑后删除（§7 回归实证：占位后全套 PASS exit 0）。该问题 1.8 开工前即存在（基线 aaed3d6 起零 diff 证明，与产品零交集），现开卫生票根治。

## Fix design

**落点：`scripts/smoke/host-contract-smoke.mjs` Round L 播种处（~759-779）**——播种时把 fixture 首行（session 头 JSON）的 `cwd` 字段重写为 harness 已自建的 `seedDir086`（`tmpdir()/picode-smoke-seed086-workspace`，恒存在），其余行**逐字节不动**：

- 首行 `JSON.parse` → 改 `cwd` → `JSON.stringify` 回写（JS 对象插入序保键序；census086 不读 cwd，期望零影响）；
- 其余行原样拼接，保持「lossless closeout」（每个种子 entry id 开/放循环后仍在盘上）断言的输入不变；
- fixture 消息 payload 里的第二处 `<cwd>...</cwd>` 文本（toolResult 回显）是无害载荷，不处理，注释说明；
- **提交的 fixture 文件本身零改动**（字节真实 fixture 是该段的价值：真实 TUI 写出的结构/id 链接/0.86 未知类型行；cwd 一个字符串字段与被测格式兼容性无关）；
- 注释记录根因（机器绝对路径卫生）与为何播种时重写而非改 fixture。

## Acceptance

- [ ] 不创建 `.worktrees/wt-105-terminal-focus` 占位目录的前提下，Round L 播种会话正常打开（cwd 指向 seedDir086）
- [ ] `npm run smoke:host` 全套 PASS exit 0，零人工前置步骤
- [ ] lossless closeout（种子 entry id 全在、resume 不追加 message 项）断言原样绿
- [ ] `tests/shared/fixtures/tui-086-session.jsonl` 零改动（git diff 验证）
- [ ] vitest 全绿（env -u，预期 125 files/2189）；eslint touched

## Red lines

- 只动 harness 播种逻辑；fixture 文件零改动；产品零改动；shared 零改动；不 push 不打 tag。

**Blocked by:** 无.
