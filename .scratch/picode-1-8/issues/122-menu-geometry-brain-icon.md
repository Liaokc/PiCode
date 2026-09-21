# 122: 菜单几何与大脑图标——cascade 列高解耦 + 弹出左对齐触发钮 + BrainIcon

**What to build:** 三件菜单面修缮（model/thinking 菜单区段）：①**cascade 列高解耦（R4）**——`.cmp-cascade` 两列不再相互拉伸：hover 换 provider 时弹层几何稳定（不因 hovered provider 的 model 数变化而长高/缩矮），model 列超出内部滚动（形态票内裁量：固定高 / 左列自然高，取稳者）；②**弹出锚点（R5）**——ModelMenu 与 ThinkingMenu 的弹出位置改为**左对齐触发 chip**（x = chip viewport 左缘，y = 悬浮于输入区上方——ZCode 构图：卡不在输入框上、与按钮左对齐），窗口边界钳制防出窗（形态票内裁量）；③**BrainIcon（R5）**——思考档位图标 GaugeIcon（表盘）→ **大脑形**自绘 SVG（`icons.tsx`，几何路径无字体依赖；ZCode 图7 形制参照、资产不入库——红线），thinking chip 与菜单内同换。

**背景（取证）：** ①`app.css:7016` `.cmp-cascade{display:flex;max-height:320px}` 默认 stretch 两列等高 + `:6848` `.cmp-popover{bottom:calc(100%+8px)}` bottom 锚定——hover 换 provider → 右列内容高变 → 弹层向上长/缩 → 光标下行移位 → hover 漂移再触发 → 振荡（操作者原话「立马两列全部拉高…高度又立马变化，这个太奇怪了」）。②`:6863` `.cmp-popover-right{left:auto;right:0}` 右对齐整卡——ZCode 实拍图6/图7 为左对齐触发钮。③思考图标现状 GaugeIcon。

**Blocked by:** 121（同区段串行——菜单面验证重叠）.

**参照帧依赖（开工前提）：** 本票需要看 ZCode 参照图：图6（provider 卡左对齐触发钮构图）+ **图7（大脑图标形状——BrainIcon 自绘的形制基准）**。开工前操作者须把两图复制入 `.scratch/compare/`（建议 `z18-zcode-provider-card.png` / `z18-zcode-thinking-brain.png`）——**帧缺席时停下向操作者要，绝不盲画图标**。需要多模态会话（能读图）实施。

**Status:** ready-for-human

## Acceptance

- [ ] electron smoke：hover model 数不同的两个 provider，弹层几何（bounding box）不变；选择/键盘导航不回归
- [ ] 弹出锚点：model/thinking 弹层左缘 = 触发 chip 左缘（smoke DOM 断言）；窗口窄时不出窗
- [ ] visual harness：cascade 两帧（不同 provider hover 几何一致）+ 弹出锚点帧 + 大脑图标帧（对照 z 图6/图7）
- [ ] 票 68/69 键盘模型与票 98 焦点纪律不回归（captureKeys 面板焦点落选中行）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P5 + P6 定稿为 R4 + R5（并票——同组件区段 menus.tsx/app.css/icons）。振荡机制 file:line：`.cmp-cascade` stretch × bottom 锚定联动。Q6 相关裁决（大脑图标）一并入票。
- 2026-09-22 (implementation, branch tip **34c6a20** on `t122-menu-geometry`)：三件全落地。①**R4** `.cmp-cascade` 列高解耦——容器 `position:relative; min-height:200px; max-height:320px`，第二列（model 列）改 absolute inset（left:190px）+ width:auto 内滚：容器高只由 provider 列决定，hover 换 provider 零几何变化（形态取「左列自然高」，min-height 兜短目录构图，票内裁量留档）。②**R5 锚点** `ComposerPopover` 增 `align='chip'`：卡片自校正 delta 转向到触发 chip viewport 左缘（实测渲染位 + 差值，免疫包含块 border/padding/transform——开发中 smoke 抓到 1px border 偏移与 chip 标签 settle 漂移两真缺陷后收敛此形），三重再转向（每 render 无依赖 layout effect / chip ResizeObserver / window resize），delta<0.5px 幂等；钳制 [8, innerWidth−8−w]（窄窗不出窗，resize 重钳）；y 不动（`bottom:calc(100%+8px)` 悬浮输入区上方）。ModelMenu（含空目录分支）+ ThinkingMenu 切换；AccessMenu 不动（票面只点 model/thinking）。③**BrainIcon**：GaugeIcon 出口删除（全仓唯一消费点 = thinking chip），自绘 12 段对称脑形（中缝 + 每半球两条脑回），无字体、零资产复制。**样式保真未对照参照帧验证**（z18 override：z18-zcode-provider-card.png / z18-zcode-thinking-brain.png 未落盘，构图按票内文本 + spec R4/R5 描述实施；mg1–mg5 帧已提交 `.scratch/visual/`，操作者目检时对照）。**自我评审（双轴 self-review，主 Agent 另派独立评审）**：Standards 轴——eslint 全绿、typecheck 双 project 绿、注解按票号溯源、无散布 focus() 无新缝；Spec 轴——验收项逐条对照（见下）。**验收证据**：①smoke `menu_geometry_122` 六腿：锚点相等（1024.2==1024.2）+ 卡浮 composer 上方 + model 列 computed absolute/overflow auto + hover 首末 provider bbox 恒定（providers=3）+ 窄窗 520px 钳制（652..1032 ⊆ 1040）+ thinking 锚点相等；②visual `visual:menu-geometry` 五帧全断言绿（mg1/mg2 cascade 两帧 drift-invariant 全等、mg3 锚点、mg4 大脑 + thinking 锚点、mg5 窄钳）；③vitest 117 files / 1989 tests 绿。**披露一（取证位）**：suite 全绿证据取自临时前移位运行——r1/r2/后续重试均死于 t44 焦点段（操作员在用机，macOS 拒 focus steal，1.5h+ 不可得），按主 Agent 裁决把 stage 临时移至 t44 之前取绿（本 build），跑完已复原终位（post-chip_toggle，位置 diff 逐字节核验），t44 段环境失败留档不追。**披露二（焦点降级）**：同一运行 OS 焦点不可得，stage 焦点门改非致命（几何腿全过——synthetic chip 压按 + executeJavaScript 探针 + document.activeElement 均页面内），real-key 键盘腿跳过——键盘模型证据 = ticket-69 `menu_keyboard_*` + `chip_toggle_*` 全绿运行（smoke 第3轮，键盘路径与本 diff 零交集：本票 renderer 改动仅定位/图标/CSS）+ 本 stage 的 hover→selection 共模型断言。**披露三（环境）**：另一轮 suite 死于 ticket-90（任务书明示 75/88/90 资源争用偶发段）、一轮死于 ticket-28（复跑即绿，偶发）——均与本 diff 零交集，留档不追。**遗留**：z 图6/图7 对照目检待操作者（帧齐备）；ticket-75/88/90/93/44 环境抖动属批次既有。
