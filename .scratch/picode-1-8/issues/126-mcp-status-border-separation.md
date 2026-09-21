# 126: MCP 状态条边框分离——设置窗间距修缮

**What to build:** 设置窗 MCP 节的状态提示条（`.settings-mcp-status-line`，如「The focused session's adapter has not reported MCP status yet.」）与下方 Global servers 白卡的**边框分离**——增加间距或调整层级（纯 CSS，票内裁量；与 Skills/Packages 节同类元素的间距节奏对齐）。状态条自身语义零改动（票 96 的诚实降级投影）。

**背景（取证）：** 操作者图2：灰色状态条紧贴 Global servers 卡、边框重叠（「我不喜欢变框重叠，请修复」）。`app.css:8216` `.settings-mcp-status-line` 与卡片容器间距缺失。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-human

## Acceptance

- [x] visual harness：MCP 节帧——状态条与两卡（Global/Project）边框零重叠
- [x] 状态条显隐两态（有快照/无快照）布局均不破；Skills/Packages 节不回归
- [x] typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P19 定稿为 R16。票 89/96 交付物视觉缺陷，纯 CSS。
- 2026-09-22 (implement, self-review)：分支 t126-mcp-border tip a9374bb。修复 = `app.css` `.settings-mcp-status-line` `margin: 0` → `margin: 0 0 10px`（对齐 Skills/Packages 同类通知行 `.settings-skills-error` 的 10px 节奏；纯 CSS、票 96 语义零改动）。验证：typecheck 绿；vitest 1969/1970（唯一败项 `tests/main/subagent-runner-root.test.ts` 为环境依赖既有失败，stash 对照证实与本票无关）；visual settings harness 全绿——s7（无会话：状态条可见+零徽标）像素级测得状态条与 Global 卡上边框间 10 逻辑px 纯背景间隙（x=900…2200 五列一致），s7b（注入快照：状态条隐藏+五徽标）search→卡直达无残留，Global→Project 卡 16px 既有节奏未动；跑前 ps 自查通过。双轴自评：Standards（单规则单属性+约束注释，零文案改动）／Spec（三验收项逐条过）均过；主 Agent 独立双轴评审待派。
