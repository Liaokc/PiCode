# 49: Composer 自适应——自动增高 74→160px + 右上角展开钮

**What to build:** New Task 空态与会话内两处 composer（共组件，一处修两处得）的输入区获得自适应高度：随内容自动增高、**74px→160px 封顶**（ZCode 实机校准 min-h-10/max-h-40 同型），超出封顶内部滚动。另加**展开钮**（操作者指定偏离——ZCode 无此钮）：输入卡**右上角常驻**图标钮，点击**原位**展开至约主区一半高（钳制 ~280–560px，下推转录，非浮层）；再点 / Esc 收回；**发送成功后自动收回**；无快捷键，悬停提示只显短描述 "Expand input"（Tooltip 词条纪律：纯图标钮无快捷键只显描述）。展开态为组件本地状态（不持久化）。

**背景（取证）：** 现状 `.composer-input { min-height: 74px; resize: none }` 固定高零自增高逻辑（app.css 实证）；长 prompt 粘贴盲写（截图 pi14-composer-longtext）；ZCode 校准 = scrollHeight 钳制式自动增高 40→160px、无展开钮（i18n 全表无入口）；ZCode fork.failed 文案先例佐证 ack 制方向（见 51）。附带：**「输入展开（Composer Expand）」词条落 CONTEXT.md**（草案见 `../intake-grilling.md`）。

**Blocked by:** None (can start immediately)。

**Status:** claimed

- [ ] 输入区随内容自动增高：74→160px 钳制，超出内部滚动（electron smoke 高度断言）
- [ ] 右上角常驻展开钮：原位展开至钳制尺寸、下推转录非浮层（smoke 尺寸/位置断言）；再点 / Esc 收回；发送成功后自动收回
- [ ] 无快捷键；tooltip 短描述 "Expand input"；两处 composer 行为一致
- [ ] 高度投影 + 展开状态机纯函数表驱动（Seam-1：内容→高度钳制 / 展开收起三路）
- [ ] 增高测量节流，无 per-keystroke 渲染风暴（票 30/46 memo 先例红线）
- [ ] visual 展开态帧入库；typecheck / lint / test 全绿
- [ ] 「输入展开（Composer Expand）」词条入 CONTEXT.md（与 intake-grilling 草案一致）

## Comments

- 2026-09-09 (requirements intake): 建票（spec R2，Q4b + Q12 六子项拍板；右上角为操作者改判，推翻 footer 推荐）。纯 renderer，可与 48/50 并行。波次：W1。
