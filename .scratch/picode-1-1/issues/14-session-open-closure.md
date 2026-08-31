# 14: 会话打开闭环——结构化回放

**What to build:** resume / 树导航 / fork 回放与 Live Follow 的转录载荷携带**结构化条目**（思考块含时长、工具调用含参数与终态输出、技能标记），回放以**折叠态思考行 + 终态工具卡**渲染，与 live 转录同构——打开旧会话不再丢失任何过程内容。契约变更全部纯增量。

**背景（取证）：** 操作者报告 resume 后内容残缺；`extractTranscriptItems` 明写丢弃思考/工具（"dropping thinking/tool traffic"），agent 密集会话回放后近乎空白。真实会话 jsonl 中 thinking/text/toolCall 分块完整，回放数据齐备。取证详见 `.scratch/picode-1-1/findings-ui-comparison.md`。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] history 载荷结构化：思考（含 host 实测时长，缺失时优雅降级）、工具（参数 + 终态输出 + 错误态）、技能标记；契约纯增量（既有消息不改名不删除）
- [ ] 回放渲染：折叠态思考行 + 终态工具卡（错误红色样式），与 live 转录同构
- [ ] Follow 与回放共用同一结构化载荷（FollowView 渲染升级由票 24 承接）
- [ ] 稳定性：同一会话反复 resume / 树导航往返，条目不重复、原文件不损坏；树分支路径同样保真
- [ ] vitest 表驱动：结构化回放 reducer 测试（Seam-1，先例 chat-reducer 套件）
- [ ] electron smoke：resume 后 DOM 断言思考行与工具卡出现；interop 阶段复开 TUI 0.84.2 所写会话
- [ ] `npm run smoke` ALL GREEN；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake): 原票含四缺口（Follow 转正 / 回放结构 / Follow 渲染 / 回合折叠），取证证据：`.scratch/compare/pi-follow-raw-markdown.png`、`.scratch/compare/z-settled-message-actions.png`。
- 2026-08-31 (/to-tickets 重切): 本票 = 结构化回放；**回合折叠 → 票 23**；**Follow 升级 + 转正 → 票 24**。
- 2026-08-31 (implement session, t14-replay-structure): 已实现并提交 **d388dac**，未自行 merge —— 请操作者运行 `bash scripts/merge-ticket.sh 14`。要点：`TranscriptItem` 升级为结构化 union（user+skillName / assistant+parts / tool+终态输出与错误态），契约纯增量（消息名与既有字段全保留）；reducer 把回放条目映射到与 live 完全相同的 entry 形状；`sniffSkillName` 同时覆盖回放与 live `user_message`；思考时长缺失时 ThinkingRow 优雅降级（无秒数段）。验证：vitest 474 全绿（含表驱动 6 类条目回放 + 幂等重放）、typecheck/lint 全绿、`npm run smoke` ALL GREEN（interop 方向 1 对真实 TUI 会话解析出 136 条结构化条目含 89 条工具项；electron 冒烟 resume 后 DOM 断言折叠思考行 / 终态工具卡 / 恰 1 张红色错误卡 / 无秒数标记）。code-review（Standards+Spec 双轴）：0 硬违规、0 spec 缺口、2 条 minor 判断项（派生 text 字段、settle/回放共享终态文案已抽取常量）。
