# 127: 设置入口去重——删 TitleBar 齿轮

**What to build:** 设置窗入口去重：**TitleBar 右上齿轮删除**（`TitleBar.tsx` 票 63 的齿轮钮——UI 面退役）；**左下 Sidebar 齿轮保留**（`Sidebar.tsx:1280`）；**⌘, 全局快捷键不动**（keymap 层零改动——快捷键与可见钮解绑后仍开合设置窗，Esc 关闭不变）。

**背景（取证）：** 操作者：「现在设置界面有两个入口，右上角和左下角，只保留左下角的」。`TitleBar.tsx:121-133`（票 63 齿轮，toggle 语义）+ `Sidebar.tsx:1280` GearIcon（底栏 P 行 ⚙）。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：TitleBar 无齿轮钮；Sidebar 齿轮开合设置窗；⌘, 开合与 Esc 关闭不回归
- [x] 设置窗打开态的返回路径（back-to-workspace）不回归（票 74 草稿停靠联动经 dispatchShellParking 不受影响——入口删减不改停靠语义）
- [x] typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P17 定稿为 R14（清理项）。票 63 的 UI 面退役、快捷键与开合语义保留。
- 2026-09-22 (implementation, self-review)：实现提交 02e1c33（分支 t127-settings-entry，本翻转提交在其上）。改动：① `TitleBar.tsx` 删齿轮钮（票 63 UI 面）+ GearIcon import + docstring 同步；② `App.tsx` `dispatchShellParking` 注释去 TitleBar 齿轮提法（停靠守卫零改动，票 74 语义字节级不变）；③ `shared/layout-model.ts` reducer 注释同步（契约形状零改动，additive-only 遵守）；④ `src/main/smoke.ts` 票 63 设置阶段重写：⓪ workspace 视图无齿轮断言、② settings 视图无齿轮断言 + ⌘, 关闭（新腿 settings_close_cmdcomma_ok）、⑦b Sidebar 齿轮开 + Esc 关（新腿 settings_open_sidebar_gear_ok / settings_sidebar_gear_esc_ok）；退役 settings_gear_toggle_ok 标记（无外部引用）。
  验证：typecheck 全绿；vitest 117 文件 / 1970 用例全过（env -u 前缀）；electron smoke 设置阶段全绿（⓪/①/②/⑦/⑦b 全部通过，packages/MCP 后续阶段亦绿）；同 run 在无关 ticket-90 阶段（子代理徽标翻转）超时 fail——该阶段在历史 run（electron-smoke-111-final / smoke10）全绿，且 t123 的 smoke 于本案 run 中途并发启动造成争用，判为环境 flake 非本案回归（本案 diff 与该阶段零代码路径交集）。视觉帧：.scratch/visual/2-settled.png（新 build，TitleBar 无齿轮）。评审为 self-review（工具集无 subagent 派发），主 Agent 另派独立双轴评审。
- 2026-09-22 (frame refresh, review follow-up)：按主 Agent 双轴评审 minor 处置，.scratch/visual/2-settled.png 刷新为 t127 新帧（2x retina 全窗口）；像素校验通过——TitleBar 右簇 3 钮（宽 76.7lg，右锚 21.1lg 与旧帧一致）vs 旧帧 4 钮（109.5lg），恰少一个 32lg 钮距；Sidebar 底栏齿轮两帧均在位（中心 ~294lg）。
