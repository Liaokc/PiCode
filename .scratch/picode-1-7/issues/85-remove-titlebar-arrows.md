# 85: 删除 titlebar 幽灵箭头

**What to build:** 标题栏左侧的两枚 ‹ › 箭头（Back/Forward）**删除**——它们是 R1 起就写死 disabled 的占位钮（零 handler），属死 chrome。视图导航历史若日后要做，单独立项（本批范围外记录）。

**背景（取证）：** `TitleBar.tsx:54-60` —— `tb-btn-disabled` + `disabled` + aria-label "Back"/"Forward"，无任何 handler；ZCode 同位是浏览器式视图导航历史（bundle quickPick.command.goBack/goForward 同族），PiCode 交互模型未定义该功能——操作者拍板删除。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] 两枚按钮从标题栏移除（⌘B 侧栏钮与标题文字之间布局正常）
- [x] 快捷键/aria 快照更新（无 Back/Forward 残留）
- [x] vitest / typecheck 全绿；纯 renderer 删除，零契约

## Comments

- 2026-09-17 (implement session)：纯删除落地，改动三处——`TitleBar.tsx`（两枚 disabled 占位钮整段移除 + `ChevronLeftIcon`/`ChevronRightIcon` import 撤除；二图标在 SettingsWindow/Sidebar/FileBrowser 各有在用语义，`icons.tsx` 导出保留）、`app.css`（`.tb-btn:not(.tb-btn-disabled):hover` 限定符随唯一 disabled 使用方消亡简化为 `.tb-btn:hover`，`.tb-btn-disabled` 规则删除）。左簇现仅 ⌘B 侧栏钮，标题绝对居中不受影响。aria/快捷键快照清点：全仓 `grep` 无 `aria-label="Back"/"Forward"`、无 `tb-btn-disabled` 残留；`keymap.ts`/smoke keymap stage（票 27 四钮探针）本就未引用两钮，零契约触碰。
- 2026-09-17 (implement session，验证)：typecheck 双 tsconfig 绿；vitest 全套 1476/1476 绿（95 文件）。`visual:transcript` 全量 harness 跑至 stage 4d 全绿（17 帧重捕获，含标题栏的全部工作区帧），并做逐像素取证：标题栏条带 y0–52 前后对照 `c85-titlebar-before/after.png`（0-empty-state）与 `c85-titlebar-before/after-2settled.png`（2-settled）——before 有 ⌘B+‹›，after 仅 ⌘B，条带内其余像素全同；帧内其余差异均为 fixture 时间性内容（问候语随时段、侧栏 "1h ago" 相对戳、thinking 时长），非结构变化。17 帧基线随本票重捕获入库（先例：票 83 验证提交同批更新 0-empty-state/0a 帧）。**完成报告截图**：`.scratch/visual/c85-titlebar-after.png`（绝对路径：`/Users/liaokechen/PiCode/.worktrees/wt-85-remove-arrows/.scratch/visual/c85-titlebar-after.png`）。
- 2026-09-17 (implement session，预先存在缺陷记录，非本票引入)：`visual:transcript` stage 4e（模型菜单开启时当前 provider 自动定位高亮，探针 `{count:14, selected:0, ok:true}`）失败。**与本票零关联的对照实验**：stash 本票两文件改动 → 重建 → 重跑，探针 JSON 字节级同型失败（两次运行均 `selected:0`，确定性）；本票 diff 仅标题栏两钮+CSS 限定符，与 composer 模型级联无交集。该 stage 最后一次入库通过帧为 2026-09-15 票 69 时点——其后票 78/72/81/82/83 间某次回归，且全量 transcript harness 因此中途夭折无人重跑（近几票均跑各自定向 harness）。**后果**：4e 之后的帧（4e/4f/5…/9… 等）本次未重捕获，其标题栏像素仍是带箭头旧基线，待 4e 回归修复后全量重跑再刷新。修复归属建议单独立项（bisect T69→T83），本票不做范围蔓延。环境备注：本会话工具 shell 带 `ELECTRON_RUN_AS_NODE=1` 且 PATH 缺 node/npm（同票 81 记录），electron 运行需 `unset ELECTRON_RUN_AS_NODE` + nvm node 22 前置；electron 二进制首次下载用本机直连完成（未走 ELECTRON_MIRROR）。操作者：`bash scripts/merge-ticket.sh 85`。
- 2026-09-17 (code-review 阻塞，同票 81/83 同型，未执行)：/code-review 两轴子代理两轮尝试均止于 spawn 层——workflow 5c987d69（子 run d9df6260/ba698f19）与 0e7b5ddb（子 run 71499b45/1b5e343c）共 4 次 child spawn 全部报 `async runner did not produce a pid for cwd: …/wt-85-remove-arrows`（0s 即失败、无 child session 文件落盘、重试字节级同型），与票 81 当日三连失败、票 83 同型 blocker 同源（governed async runner 在本会话环境无法产出子进程 pid；会话 shell 带 `ELECTRON_RUN_AS_NODE=1` 且 PATH 缺 node/npm，疑同源）。已按 lane-blocker 规则停止并上报操作者，未做任何非受控回退（未切 interactive_shell/pi -ne/外部 CLI）。实现者已在会话内完成两轴自查（非正式 review 替代，正式 review 待操作者在可用环境补跑或批准替代方式）：**spec 轴**——票面三验收项逐条落地（两钮删除+布局正常/aria·快捷键零残留 grep 清/vitest·typecheck 绿），零范围蔓延（CSS 死规则清理属删除必然伴随，4e 预存缺陷只记录不修），零契约触碰；**standards 轴**——纯删除无新增命名/抽象/重复，无 Fowler smell 触点，遵循 spec.md 测试纪律（未为删除添加源码字节型测试），CONTEXT.md 无过时词条需更新。
