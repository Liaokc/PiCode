# 138: cascade 终验重修——两列真分离 + 选择卡贴触发钮（票 122 交付物修订）

**What to build:** provider/model 选择卡与 thinking 卡按 ZCode 截图重修（票 122 交付物终验未达标）两处：①**两列真正分离**——provider 列与 model 列各自独立高度与边界（ZCode 构图：两列不同高、各自圆角/边界），不再是同高连体面板；②**弹出卡贴钮**——选择卡**贴在触发按钮上**（紧贴 chip 上缘/边缘，ZCode 构图），不是悬浮在输入栏上方（票 122 交付把锚点做在了输入栏上）；thinking 卡同规则。票 122 原验收（hover 换 provider 几何稳定、键盘/焦点纪律）不回归。

**背景（取证）：** 操作者终验（v1.8.0 开发完成后的 npm run dev 实拍）：PiCode 当前实现（pi19-menu-current）两列仍连体、卡在输入栏上；ZCode 参照（z19-menu-1/2）两列分离、卡贴按钮。**参照帧 = 实施前提**（`reference/z19-menu-1.png` / `reference/z19-menu-2.png` / `reference/pi19-menu-current.png` 三帧；缺席则停下向操作者要——不盲修视觉）。**需要多模态会话实施**（对照 ZCode 帧）。

**Blocked by:** 无（对已合并 main 的修订票）.

**Status:** ready-for-agent

## Acceptance

- [ ] visual harness：cascade 帧对照 z19-menu-*——两列分离（各自高度/边界清晰）、选择卡贴触发钮；thinking 卡同规则帧
- [ ] electron smoke：hover 几何稳定（票 122 原验收不回归）+ 弹出锚点 = chip 边缘（DOM 断言：卡缘与 chip 缘相接）
- [ ] 票 68/69 键盘模型与票 98 焦点纪律不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 8)：P29 定稿 R22。终验实拍三帧为准；票 122 的几何稳定语义保留、构图与锚点按帧重修。
