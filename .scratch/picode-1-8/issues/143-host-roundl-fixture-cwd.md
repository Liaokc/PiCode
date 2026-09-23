# 143: smoke:host Round L fixture 机器绝对路径卫生——播种时重写 session 头 cwd

**Status:** ready-for-human

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

## Comments

- 2026-09-23 (implementation, af54549)：`scripts/smoke/host-contract-smoke.mjs` Round L 播种处（+25/−0，fixture 零改动）——首行 session 头 `JSON.parse` → `cwd = seedDir086` → `JSON.stringify` 回写，其余行字节不动；census086 不读 cwd 期望零影响；头部形状漂移响亮失败（type/cwd guard）；lossless-closeout 读同一重写串，seeded-vs-disk 不变量保持。
- 2026-09-23 (review fix round, d2c802b)：双轴评审两 minor 闭环——①payload 注释更正（另一处机器路径出现在 line-4 system preamble 的 `<cwd>` 文本，非工具结果载荷；及后续 toolResult 内裸路径——均为无害 message payload，保持 byte-real）②可逆性守卫（`lines[0].replace(JSON.stringify(seedDir086), JSON.stringify(originalCwd)) !== originalFirst` 即 fail——证明 round-trip 只换 cwd 值，未来 header escape（\uXXXX）静默重编码其他字节会在此响亮失败）。产品源与 af54549 一致。
- 2026-09-23 (dual-axis review)：standards **approve**（0 must-fix / 2 minor / 2 nit：三变量局部化、fail-fast guard、注释描述指称精准度——修轮全闭环；fixture 零改动验证 git diff empty）；spec **pass**（0 must-fix / 0 partial / 2 note：零占位目录前提满足 + Round L 271/271 byte-identical 实证 + fixture 无关断言未动；Round K 死 = worker 会话 env 泄漏 `PI_SUBAGENT_CHILD` × host-contract-smoke.mjs forkHost()（408-415）未剥标记——pre-existing、与 Round L 改动零交集、不影响验收；干净 env 全套过；forkHost 缺口候选微票另立，发版后立案）。
- 2026-09-23 (verification)：**零占位目录前提下 smoke:host 全套 PASS exit 0 两轮**（af54549 干净 env 跑 + d2c802b 主会话直跑；Round L：seeded opened / replay 210 / tree 270 / shutdown **271/271 byte-identical**）；vitest 125 files/**2189 全绿**（env -u）；eslint touched 绿。提交链：af54549（实现）→ d2c802b（评审修轮，分支 tip）。
