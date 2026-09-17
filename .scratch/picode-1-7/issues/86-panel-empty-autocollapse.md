# 86: 侧栏零标签自动折叠

**What to build:** 右侧边面板的**所有 tab 关闭后，面板自动折叠**——不再残留一个空壳（"Choose which tab to open" 选择页）。重开路径不变：⌥⌘B / 标题栏钮 → 面板打开；零 tab 时显示既有的 tab 选择页（兜底 UI 现成）。深链打开新 tab 时面板自动展开的既有行为不回归。

**背景（取证）：** 零 tab 状态可达（review 也可关，`panel-model` close-tab 无特判，`panel-model.ts:198-209`）；关到零时 `SidePanel.tsx:124` `showPicker = pickerOpen || openTabs.length === 0` 显空壳选择页而面板 open 状态不变。开合状态在 shell 布局模型（`layout-model.ts` sidePanelOpen）、标签在面板模型（panelReducer）——跨模型联动的落点票内裁量（渲染层派生 effect 或 App 层联动均可，纯状态修零契约）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] 关闭最后一个 tab → 面板自动折叠（electron smoke 断言开合状态 + 无空壳残留）
- [ ] ⌥⌘B / 标题栏钮重开 → 零 tab 时显 tab 选择页；从选择页/最近关闭重开 tab 正常
- [ ] 深链（文件/轨迹/turn-diff/Review）打开时面板自动展开不回归
- [ ] Seam-1：零标签→折叠联动纯逻辑表驱动
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
