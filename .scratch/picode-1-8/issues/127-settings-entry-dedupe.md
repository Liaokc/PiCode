# 127: 设置入口去重——删 TitleBar 齿轮

**What to build:** 设置窗入口去重：**TitleBar 右上齿轮删除**（`TitleBar.tsx` 票 63 的齿轮钮——UI 面退役）；**左下 Sidebar 齿轮保留**（`Sidebar.tsx:1280`）；**⌘, 全局快捷键不动**（keymap 层零改动——快捷键与可见钮解绑后仍开合设置窗，Esc 关闭不变）。

**背景（取证）：** 操作者：「现在设置界面有两个入口，右上角和左下角，只保留左下角的」。`TitleBar.tsx:121-133`（票 63 齿轮，toggle 语义）+ `Sidebar.tsx:1280` GearIcon（底栏 P 行 ⚙）。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：TitleBar 无齿轮钮；Sidebar 齿轮开合设置窗；⌘, 开合与 Esc 关闭不回归
- [ ] 设置窗打开态的返回路径（back-to-workspace）不回归（票 74 草稿停靠联动经 dispatchShellParking 不受影响——入口删减不改停靠语义）
- [ ] typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P17 定稿为 R14（清理项）。票 63 的 UI 面退役、快捷键与开合语义保留。
