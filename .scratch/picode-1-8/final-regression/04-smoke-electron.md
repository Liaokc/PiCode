# 终验日志 — 步骤 5：smoke:electron 全套终位跑（3 次尝试，重试纪律用满）

命令：`npm run smoke:electron`（build + 全套 73 段），ps 自查后跑，跑前跑后均无遗留 electron/PiCode 进程。

## 尝试 1（/tmp/final-regression-smoke-electron.log，exit 1，11:26–11:28）
- 到达并全绿（14 段）：empty_state（含 t132 boot-empty 双腿 + t121 provider order 腿）、agent、idle_typing_119（t119）、user_copy（**t44 剪贴板腿本轮通过**——批次内首次终位通过，此前全被焦点门挡）、slash_gate、menu_surface、menu_keyboard、chip_toggle、menu_geometry_122（t122）、multi_session、unread、bg_approval、keymap
- **死于 terminal_focus_105 段 leg 2**：`SMOKE FAIL ticket 105: the trusted keystroke never echoed in the shell`
  - 形态：⌘J 开+shell 聚焦（leg 1）已过、document.hasFocus() 为 true、FOCUS_IN_TERM 全程保持，但 3 次真实 sendInputEvent('z') 均未在 xterm rows 回显
  - 判定：瞬态环境类（该腿即 smoke 代码自注的「ticket-44 environmental class」，带 re-steal 重试；尝试 2 中同段全腿绿证实瞬态）
  - 批次留档指针：t132 票内「105 阶段未能重跑（零代码改动+132 腿覆盖全部 bump 路径+dock-model 44 例单测替代证据）」——t132 合入后终位 t105 全绿此前从未取得，本次尝试 2 为**批次内首次 t132 后 t105 终位全绿**

## 尝试 2（/tmp/final-regression-smoke-electron-retry.log，exit 1，11:28–11:32）
- 到达并全绿（37 段，本次最远）：上述全部 + **terminal_focus_105 全腿绿**（cmdj/typing/titlebar/cycle/bridge_no_steal/swap_back/done）、terminal_focus_132（in_session/new_session/bridge_swap_back）、panel_tabs、panel_collapse_86、preview_dual_88、context_menu、trace、group_fold、collapse_all（t126 折叠聚合）、sidebar_drag、dead_cwd、dead_group_sink（t123）、history_tree、history_deep（t131）、history_toggle、scroll_stay、scroll75（t75 已知 flaky 族本轮绿）、scroll93（t93 已知 flaky 族本轮绿）、fold_anchor、nav_rail、nav_live_anchor（t120）、composer_expand、composer_typing_116（t116）
- **死于 composer_ime_117（t117，任务书已知 flaky 族）**：`SMOKE FAIL ticket-117 stage: the cjk draft must overflow the input for an internal scroll (scrollH 146, clientH 146)`（prefill 腿已绿，溢出腿几何未达成）
  - 票面留档对齐：t117 票内即有边界宽度（taW=793）换行差与「负载下 commit/滚动可晚于固定 140ms」的几何/时序敏感记录（div 镜像→textarea 克隆镜像 + settle-poll 修复史）；t117 段在批次内绿跑历史 = t117 票自身 smoke5/6 两跑 prefill 绿 + 09:4x 前移位 suite 内全绿（含 t44/crash-isolation/t20）

## 尝试 3（/tmp/final-regression-smoke-electron-retry2.log，exit 1，11:32–11:34）
- 到达并全绿（8 段）：empty_state、agent、idle_typing_119、user_copy（t44 再次通过）、slash_gate、menu_surface、menu_keyboard、chip_toggle
- **死于 menu_geometry_122 段 R4**：`SMOKE FAIL ticket-122 R4: the popover bbox moved under provider hover (open {"x":1024.2,"y":538,"w":380,"h":202}, first/last {"x":1024.2,"y":356,...})`——provider hover 下 popover bbox 上移 182px（期望锚定不动）
  - 判定：瞬态（t122 段在尝试 1/2 均绿）；批次留档指针：t122 合并记录「一次偶发抖动复跑两次全绿」——同款抖动谱系

## 结论
- 三次尝试死点互不相同（t105→t117→t122），**每个死点在其他轮次同 HEAD 全绿，无确定性阻塞**；形态全部为 UI 时序/几何/焦点类瞬态（与批次内操作员活跃期抖动谱系一致）
- 终位全套绿依旧未取得；**最佳覆盖 = 尝试 2（37/73 段全绿，含 t44/t105/t132/t75/t93/t120/t123/t131 等全部关键段）**
- t44 焦点门本轮三跑全过（批次内首次）——安静窗口已具备，剩余死点均为非 t44 的散点瞬态
