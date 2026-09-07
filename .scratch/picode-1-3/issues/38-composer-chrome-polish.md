# 38: Composer/Chrome 三合一——访问菜单打磨 + 删幽灵按钮 + slash 退役守门

**What to build:** 三个小件一次到位：① 访问模式菜单行距修复（粗体模式名与浅色描述之间的间距，现状两 span 相邻零间隙）+ 盾牌图标按档位分色（Full Access 橙 / Standard 灰 / Read Only 绿，复用既有色 token）——审批语义零改动；② 删除标题栏右上角 Help 幽灵按钮（无 onClick 的死控件）；③ `/` 菜单退役六条与既有入口重复的 Pi 内建命令（/new /tree /name /copy /model /thinking；`/compact` 保留），并加**发送守门**：手敲这六条（裸命令与带参形式）回车时 toast 指路（如 "/model — use the Select Model picker"），会话零发送。附带：**调用轨迹（Call Trace）词条落 CONTEXT.md**（1.2 漏落补账，草案见 `../intake-grilling.md` 附录）。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 访问菜单三行：模式名与描述有明显间距；盾牌橙/灰/绿分色；勾选/键盘行为不变
- [x] 标题栏 Help 按钮删除，布局无残缺
- [x] `/` 菜单不再出现六条内建；`/compact` 与提示模板/技能行为不变
- [x] 手敲六条（含 `/name xxx` 带参形式）→ toast 指路、不发给会话；其他 `/` 文本不受影响
- [x] 守门纯函数表驱动（Seam-1：text → {hint} | null）
- [x] electron smoke：toast 断言 + 会话零新消息断言；visual 帧（访问菜单间距+三色）
- [x] 调用轨迹词条入 CONTEXT.md；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R6+R7+R10 合一，操作者批准）。守门纯函数同型先例 keymap.ts；菜单样式先例票 22/33。含调用轨迹词条补账 rider。波次：W1。
- 2026-09-04 (implement): 全项落地，提交 f59e32e（分支 t38-composer-chrome，rebased on main c6829ae）。守门落 `src/shared/composer/slash-gate.ts`（表驱动，tests/shared/slash-gate.test.ts 8 例）；菜单退役同步 `PICODE_BUILTIN_COMMANDS`；electron smoke 新 slash-gate 阶段全绿（slash_menu_retired_ok / slash_gate_toast_ok / slash_gate_args_toast_ok / slash_gate_zero_send_ok，user_message 观察者证零发送）；新 `visual:access` harness 出帧 `.scratch/visual/a1-access-menu.png`（间距 8px 计算样式断言 + 三色 rgb 断言 + 单勾选）；调用轨迹词条已原文入 CONTEXT.md（与 intake 附录逐字 diff 一致）。typecheck / lint / vitest 895/895 全绿。待操作者 `bash scripts/merge-ticket.sh 38`。
- 2026-09-04 (merge): merged as **ead2f02**（--no-ff，rebase 干净：分支 tracker 提交 7e09194 与 main 侧 bc94d92 内容相同被自动去重）。验收口径：操作者在 wt-38 `npm run dev` 目检后明说「已验收」。冲突处置：无。main 终态审计全绿：typecheck + vitest **895/895**（69 文件，基线 886 净增 9）；CONTEXT 调用轨迹词条 / app.css Ticket-38 追加段 / slash-gate 纯函数套件均幸存；无冲突标记残留。解锁：**41**。
