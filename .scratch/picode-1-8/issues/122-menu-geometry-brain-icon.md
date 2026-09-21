# 122: 菜单几何与大脑图标——cascade 列高解耦 + 弹出左对齐触发钮 + BrainIcon

**What to build:** 三件菜单面修缮（model/thinking 菜单区段）：①**cascade 列高解耦（R4）**——`.cmp-cascade` 两列不再相互拉伸：hover 换 provider 时弹层几何稳定（不因 hovered provider 的 model 数变化而长高/缩矮），model 列超出内部滚动（形态票内裁量：固定高 / 左列自然高，取稳者）；②**弹出锚点（R5）**——ModelMenu 与 ThinkingMenu 的弹出位置改为**左对齐触发 chip**（x = chip viewport 左缘，y = 悬浮于输入区上方——ZCode 构图：卡不在输入框上、与按钮左对齐），窗口边界钳制防出窗（形态票内裁量）；③**BrainIcon（R5）**——思考档位图标 GaugeIcon（表盘）→ **大脑形**自绘 SVG（`icons.tsx`，几何路径无字体依赖；ZCode 图7 形制参照、资产不入库——红线），thinking chip 与菜单内同换。

**背景（取证）：** ①`app.css:7016` `.cmp-cascade{display:flex;max-height:320px}` 默认 stretch 两列等高 + `:6848` `.cmp-popover{bottom:calc(100%+8px)}` bottom 锚定——hover 换 provider → 右列内容高变 → 弹层向上长/缩 → 光标下行移位 → hover 漂移再触发 → 振荡（操作者原话「立马两列全部拉高…高度又立马变化，这个太奇怪了」）。②`:6863` `.cmp-popover-right{left:auto;right:0}` 右对齐整卡——ZCode 实拍图6/图7 为左对齐触发钮。③思考图标现状 GaugeIcon。

**Blocked by:** 121（同区段串行——菜单面验证重叠）.

**参照帧依赖（开工前提）：** 本票需要看 ZCode 参照图：图6（provider 卡左对齐触发钮构图）+ **图7（大脑图标形状——BrainIcon 自绘的形制基准）**。开工前操作者须把两图复制入 `.scratch/compare/`（建议 `z18-zcode-provider-card.png` / `z18-zcode-thinking-brain.png`）——**帧缺席时停下向操作者要，绝不盲画图标**。需要多模态会话（能读图）实施。

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：hover model 数不同的两个 provider，弹层几何（bounding box）不变；选择/键盘导航不回归
- [ ] 弹出锚点：model/thinking 弹层左缘 = 触发 chip 左缘（smoke DOM 断言）；窗口窄时不出窗
- [ ] visual harness：cascade 两帧（不同 provider hover 几何一致）+ 弹出锚点帧 + 大脑图标帧（对照 z 图6/图7）
- [ ] 票 68/69 键盘模型与票 98 焦点纪律不回归（captureKeys 面板焦点落选中行）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P5 + P6 定稿为 R4 + R5（并票——同组件区段 menus.tsx/app.css/icons）。振荡机制 file:line：`.cmp-cascade` stretch × bottom 锚定联动。Q6 相关裁决（大脑图标）一并入票。
