# 77: 上下文圆环——模型 chip 左侧 ring + hover 弹卡

**What to build:** composer 模型 chip 左侧新增**上下文圆环**（形态对照 pi16-context-ring）：占用 = 最近一条 assistant message usage（**input + cacheRead + cacheWrite + output 全计入**）÷ 当前模型 contextWindow；hover 弹**数据弹层**（非 Tooltip 组件，对照 pi16-context-ring-hover）：百分比 + used/limit tokens + IN/OUT/cacheRead/cacheWrite 四元组 + 缓存命中率（cacheRead/(input+cacheRead)）；无 assistant 消息/无 usage 显**灰环**、无 hover；compaction 后自然取最新 usage（纯投影零特判）；**ZCode 分类分解不做**（消息/系统工具/技能等占比——会话文件无此记账，数据源如实原则）；仅 ChatView（FollowView / New Task 不做——回底钮先例）。**additive 契约增量**：模型引用增 `contextWindow?` 字段（模型目录载荷携带，host 从 pi-ai Model 读）；实施期**与 Pi TUI 同场景校准分子口径**并留档 ticket comment。

**背景（取证）：** PiCode 无此供面。usage 四元组在会话文件（ADR-0002 ✓）；contextWindow 不在契约（pi-ai Model 字段，models.md:207）；ZCode 分类分解为 ZCode 内部记账不可得。取证据见 `../intake-grilling.md` R5 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] Seam-1 圆环投影（usage→百分比/命中率/灰环降级/无 usage 态）
- [x] host-contract smoke：`contextWindow` additive 增量（旧载荷缺字段照常通过）+ **实施时报备入账**
- [x] electron smoke：种子 usage 渲染环 + hover 弹卡内容齐全
- [x] visual harness：环帧 + hover 帧（对照 pi16-context-ring / pi16-context-ring-hover）
- [x] 与 Pi TUI 同场景分子口径校准记录（ticket comment 留档）
- [x] FollowView / New Task 不显（界外确认）
- [x] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-16（implement session，branch t77-context-ring）：**Seam-1 纯模型** `src/shared/context-ring.ts`（19 表驱动用例）：`contextRingView({usage, contextWindow})` → `idle / no-window / ready` 三态 + fraction/percent/used/limit/usage/cacheHitRate；formatters（千分位、一位小数去尾零）；`assistantUsageOfMessage`（有效性规则，下述校准节）+ `lastAssistantUsage`（叶子路径倒序走查）。**契约增量（additive，三项，均已报备入 host-contract smoke）**：① `ModelRef.contextWindow?`（host 从 pi-ai Model 读，runtime 模型恒有值——模型配置缺省时 SDK 填 128000；composer-list `toModelRef` 仅在有限正数时拷贝，旧载荷/新任务投影字段缺席照旧）；② `message_end.usage?`（live 路径：SDK 消息经 `assistantUsageOfMessage` 投影后随 HeldMessageEnd 持有，persistence 时刻带 entryId 释放；flush（entry 未落盘）路径同样携带——消息确实完成了）；③ `history_loaded.usage?`（replay 路径：host 对 `buildContextEntries()` 叶子路径走查 `lastAssistantUsage`；缺席/null = 灰环，旧载荷兼容）。**reducer**：`ChatState.lastUsage`——message_end 带 usage 即推进（转写形态欠妥时也推进：usage 投影与转写修正解耦）、缺 usage 保持原值（aborted/errored 不清账）、history_loaded 按 event 重derive、session_created 归零；compaction 零特判（纯投影，下一条 assistant 自然刷新——与 SDK getContextUsage 的「compaction 后置 null」有意偏离，取「诚实最后已知」）。**渲染**：`ContextRing.tsx`（15px SVG 双圆，arc 从 12 点顺时针，灰 = 仅 track）；hover 数据弹层非 Tooltip 组件——「Context window 66,000 / 1,000,000 (6.6%)」头行 + 蓝色细条 + IN/OUT/cacheRead/cacheWrite 四元组 + 分隔线 + Cache hit rate（短延迟开合 120/80ms，弹层可悬停保开）；仅 ChatView 传 `contextRing` prop（Composer 共享组件缺省不渲染 → New Task 界外；FollowView 无 composer 结构性界外）。electron smoke ticket-77 stage 五锁（idle 灰环无 hover / 种子 usage 经 resume 渲染环 + 弹层四元组 + 37.5% 命中率 / 注入 composer_state(200k)+message_end(100k) 精确 0.5 弧与 50% 弹层 / New Task 无环 / Follow 无环）；visual harness `visual:context-ring` 三帧（cr1-ring-idle / cr2-ring-usage / cr3-ring-hover）。全套：vitest 1392/1392、typecheck 清、`npm run smoke` ALL GREEN（6 stages；首轮 electron smoke 在 ticket-76 处偶发挂——provider 高亮检查的时序 flake，与本票无关，复跑全绿）。

- **分子口径 × Pi TUI 同场景校准记录**：TUI 读数 = SDK `AgentSession.getContextUsage()` → `estimateContextTokens(messages)` = **最后一条有效 assistant usage 的 `totalTokens`（缺记录则四元组和）+ 其后消息的 trailing 估算（chars/4，含 4800/图）**；「有效」= stopReason ∉ {aborted, error} 且 total > 0（SDK compaction.js `getAssistantUsage`）。PiCode 圆环分子 = `UsageTokens.total`（= totalTokens ?? 四元组和，ADR-0002 同一 normalizeTokens 口径）+ **零 trailing 估算**，有效性规则逐条同 TUI（`assistantUsageOfMessage`）。**实测对照（7 个真实会话文件，同文件双投影脚本比对）**：6/7 完全相等（220,494 / 292,568 / 22,244 / 19,227 / 21,121 / 静止态 smoke 会话 6,484——host-contract smoke 的 history_loaded.usage 亦逐次验证）；1/7 差 1,048 tokens（23,123 vs 24,171）——该文件末条有效 usage 之后有 2 条 toolResult + 1 条 aborted assistant（trailing 内容），TUI 估入、圆环不计。**结论**：静止/落定态两口径严格相等；流式中间态 TUI 含 chars/4 trailing 估算而圆环纯 usage 投影（票口径「最近一条 assistant message usage」，零估算——数据源如实）。% 与命中率为纯除法，与 TUI 的 contextWindow 同源（pi-ai Model）。

- **实施备注**：① smoke/visual 的 DOM probe 曾因模板字面量 `\'` 转义写成非法 JS（selector 内引号）被 executeJavaScript 静默吞掉——改为 selector 内双引号（visual 先行发现，smoke 修后全绿）；② quiet 种子文件必须全新手写（writeVisualSession 形状，resume 链已验证）——拷贝 host 模板会带入模板自身的真实 assistant usage，灰环前提即失；③ host-contract smoke 报备行：`ticket-77 additive increments ok — 2/2 model refs carry contextWindow, 9/10 message_ends carry usage`（1 条 message_end 无 usage = abort 回合，符合有效性规则）。
