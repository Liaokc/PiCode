# t126 progress — MCP status line border separation

- 目标（一句话）：`.settings-mcp-status-line` 与 Global/Project 卡边框分离（纯 CSS，间距节奏对齐 Skills/Packages 节），状态条显隐两态布局不破（票 96 语义），UI 文案全英文、视觉零语义变化。
- 阶段 = 开工（2025-06-XX，待读票面后补时间戳证据）

## 事件记录

- [开工] 创建本 progress 文件；下一步：读票面 126 / CONTEXT.md / spec.md R16。
- [取证] 票面/spec R16/CONTEXT.md 已读；overlap 根因定位：`app.css:8216` `.settings-mcp-status-line { margin: 0 }` — 状态条与下方 Global 卡（`.settings-card` 无 margin-top）完全贴齐，圆角 inset 背景叠在卡边框上。同类元素间距节奏：Skills/Packages 的通知行 `.settings-skills-error` = `margin-bottom: 10px`（卡片上方同类元素），MCP OAuth 盒 `.settings-mcp-auth` = `margin-bottom: 14px`。
- [取证] 显隐两态确认：`McpSection.tsx` 中 `statusLine !== null` 才渲染 `<p class="settings-mcp-status-line">`；有快照时整行不渲染（票 96 语义）。visual-settings harness 已有 s7（无会话→状态条可见+零徽标）与 s7b（注入快照→状态条隐藏+五徽标）两帧，正是验收所需两态。`.settings-mcp-status-line` 仅 McpSection 使用（grep 全仓）——Skills/Packages 不可能回归。
- [验证] typecheck 全绿（tsconfig.node + tsconfig.web 均过）。
- [验证] vitest 全套：1969/1970 过；1 败 = `tests/main/subagent-runner-root.test.ts`（stash 验证：未含本票改动时同样败——环境依赖的既有失败，与本票无关，不修不扩）。
- [验证] visual harness（`npm run visual:settings`，跑前 ps 自查通过——无 electron/PICODE 进程）：全部断言过（palette/provider order/cascade/MCP no-session honest line + 零徽标/MCP status projection 五徽标 + line hidden），帧落盘 s7-settings-mcp.png / s7b-settings-mcp-status.png（+ s5 Skills / s6 Packages 无异）。
- [验证] 像素级几何断言（PNG 解码扫描，DPR=2）：s7 帧 x=900…2200 五列均测得——状态条 inset(#f1f1ee) 底缘 row 534 → 20 物理px（=10 逻辑px）纯 bg-main(#fafaf8) 间隙 → Global 卡上边框(row 555, #e7e7e4)。**零重叠达成**。Global→Project 卡间距 16 逻辑px（.settings-card 既有 margin-bottom，未动）。s7b 帧（有快照、状态条隐藏）：search 底 → 16px 间隙 → Global 卡边框直达，无残留 inset——两态布局均不破。
- [自评-双轴] Standards 轴：单规则单属性变更（margin: 0 → 0 0 10px）+ 三行约束注释（对齐同文件 Ticket 96 注释风格）；零死代码零重复；UI 文案零改动；仓库原则「不测 CSS 字节」→ 无需新测试缝。Spec 轴：票面三验收项逐条对照均过（见上）；纯 CSS ✓；票 96 语义零改动（无 TS/TSX 改动，mcpStatusLine 逻辑未触）✓；`[data-mcp-status-line]` harness 断言只探存在/文本不探几何，无冲突。Skills/Packages 无回归路径（该类仅 McpSection 使用，grep 全仓单点）。
- [提交] 修复提交 a9374bb（app.css + s7/s7b 帧；s1–s6 重拍噪声已还原，循票 96 只提交本票帧惯例）；票 Status→ready-for-human + Comments 记 tip sha，随分支提交 9f6d6f4。分支 t126-mcp-border tip = 9f6d6f4，工作树 clean，未 merge 未 push（主 Agent 跑 scripts/merge-ticket.sh 126）。
- [终态] 实现完成、双轴自评过、验收三项全过。证据：s7 帧 /Users/liaokechen/PiCode/.worktrees/wt-126-mcp-border/.scratch/visual/s7-settings-mcp.png（状态条与 Global 卡 10px 间隙）；s7b 帧（隐藏态）。遗留风险：无——纯 CSS 单规则；唯一既败测试与本票无关。
