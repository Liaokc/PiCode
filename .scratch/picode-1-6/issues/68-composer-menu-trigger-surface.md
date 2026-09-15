# 68: Composer 文本菜单触发面修订——斜杠/@ 同规则 + Shift+Enter 守卫

**What to build:** 斜杠菜单与 @ 文件菜单的开启/关闭收敛为同一个纯函数决策面：菜单只在**光标位于首行行首 token 内**（文本以 `/` 或 `@` 开头且光标前无换行、无空格）时开启；**换行（Enter/Shift+Enter）、空格、光标移出 token** 三者立即关闭；**零匹配不渲染菜单**——"No matching commands/files" 常驻框消失（对照 pi16-slash-menu-multiline / pi16-slash-no-match-persist / pi16-at-no-match 三帧病源），Enter 落回发送路径（未知命令照旧透传 SDK）；菜单键盘处理的 Enter 分支补 shiftKey 守卫——**Shift+Enter 在任何菜单态（含零匹配）永远插入换行**，不再被拦截直发。斜杠与 @ 两菜单共用同一触发面实现。

**背景（取证）：** 触发条件是「整段文本以 / 开头」不看光标行位（Composer handleChange）；菜单键盘 Enter 分支不查 shiftKey、零匹配时直接 dispatch（pi16-slash-menu-multiline 正是该状态实锤）；@ 菜单共用 handleChange 链路。file:line 级根因见 `../intake-grilling.md` R2/R3 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] Seam-1 触发面决策表（文本形态 × 光标位 × 键事件 → 菜单开/关），斜杠与 @ 同表驱动（slash-gate/keymap 套件先例）
- [x] 多行以 `/` 开头的文本：光标不在首行 token 内时菜单全程不渲染
- [x] 换行/空格/光标移出 token 三路径即时关闭
- [x] 零匹配：菜单不渲染；Enter 走发送；未知命令透传 SDK 语义不回归
- [x] Shift+Enter：任何菜单态永远换行（含零匹配态）
- [x] electron smoke：手打多行 `/` 报告文本全程无菜单；`/skill:xxx` 零匹配回车直发
- [x] 纯 renderer 改动，零契约增量
- [x] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程（dev-app serialization，撞锁等待不并跑）

## Comments

- 2026-09-15 (implemented, t68-menu-trigger): 触发面收敛为 `src/shared/composer/menu-surface.ts` 的 `textMenuSurface(text, caret)`（Seam-1 纯函数，零依赖零 DOM）——`/` 与 `@` 同表：文本以触发符开头 + 光标在行首 token 内（caret ≥ 1 且光标前无空白）才开，query = 触发符到光标间文本；换行/空格/光标移出即 null，光标重回 token 即重开（match-agnostic——零匹配关停归渲染门）。Composer handleChange/syncCaret 全部汇入 `syncTextMenu`（单一 reconcile 点，ticket 69 键盘统一可平移）；`handleMenuKey` 零匹配提前 return false（箭头还光标、Enter 落发送路径带 isComposing 守卫——比旧直 dispatch 更 IME 安全），Enter 分支 shiftKey 守卫前置。渲染门 `slashRows.length > 0` / `fileRows.length > 0`——"No matching commands/files" 框删除，list-menus 改收预过滤 rows。零契约增量；提交 64baea3 + review 修复 9371e6b。
- 2026-09-15 (code-review 两轴)：Standards 轴——Seam-1 纪律/工单注释/全英文文案/零契约达标；发现 syncTextMenu 早退守卫缺 kind 比对（一次事件内 `/ab`→`@ab` 换触发符时菜单态滞留 slash）→ 9371e6b 修复。Spec 轴——验收项全覆盖；Shift+Enter 缺 electron smoke 证据 → composerKeyJs 增修饰键参数 + 新增 `menu_surface_shift_enter_ok` 检查点（菜单开着 Shift+Enter 不 pick 不直发）。
- 2026-09-15 (verification)：vitest 1321/1321 全绿（含新 menu-surface 表 23 行 + 多行走查 + match-agnostic 三测）；typecheck 双 tsconfig 干净；electron smoke 两次全跑：SMOKE done、零 FAIL——`menu_surface_leading_token_ok` / `menu_surface_shift_enter_ok` / `menu_surface_multiline_ok` / `menu_surface_at_midtext_ok` / `menu_surface_zero_match_send_ok`（`/skill:zzzqqq` 零匹配无菜单、回车 user_message 原文透传、无 retired toast、composer 清空）。中间两次失败均为环境层：一次与 wt-73 smoke 撞车（dev-app serialization 生效——撞锁即退），一次 600s 工具超时误杀 + bg-deny UI 焦点抖动（该阶段同代码上一次全绿）；ps 自查已按验收项执行。**操作者：`bash scripts/merge-ticket.sh 68`（勿忘 spec 内待办：merge-ticket.sh:50 ls-files 补 picode-1-6）。**
