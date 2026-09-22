# 138: cascade 终验重修——两列真分离 + 选择卡贴触发钮（票 122 交付物修订）

**What to build:** provider/model 选择卡与 thinking 卡按 ZCode 截图重修（票 122 交付物终验未达标）两处：①**两列真正分离**——provider 列与 model 列各自独立高度与边界（ZCode 构图：两列不同高、各自圆角/边界），不再是同高连体面板；②**弹出卡贴钮**——选择卡**贴在触发按钮上**（紧贴 chip 上缘/边缘，ZCode 构图），不是悬浮在输入栏上方（票 122 交付把锚点做在了输入栏上）；thinking 卡同规则。票 122 原验收（hover 换 provider 几何稳定、键盘/焦点纪律）不回归。

**背景（取证）：** 操作者终验（v1.8.0 开发完成后的 npm run dev 实拍）：PiCode 当前实现（pi19-menu-current）两列仍连体、卡在输入栏上；ZCode 参照（z19-menu-1/2）两列分离、卡贴按钮。**参照帧 = 实施前提**（`reference/z19-menu-1.png` / `reference/z19-menu-2.png` / `reference/pi19-menu-current.png` 三帧；缺席则停下向操作者要——不盲修视觉）。**需要多模态会话实施**（对照 ZCode 帧）。

**Blocked by:** 无（对已合并 main 的修订票）.

**Status:** ready-for-human

## Acceptance

- [ ] visual harness：cascade 帧对照 z19-menu-*——两列分离（各自高度/边界清晰）、选择卡贴触发钮；thinking 卡同规则帧
- [ ] electron smoke：hover 几何稳定（票 122 原验收不回归）+ 弹出锚点 = chip 边缘（DOM 断言：卡缘与 chip 缘相接）
- [ ] 票 68/69 键盘模型与票 98 焦点纪律不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 8)：P29 定稿 R22。终验实拍三帧为准；票 122 的几何稳定语义保留、构图与锚点按帧重修。
- 2026-09-22 (implementation, branch tip **2d4406f** on `t138-cascade-rework`)：两处重修全落地，纯 renderer/CSS + smoke/visual 断言层，零契约增量。**①两列真分离**——`.cmp-popover-cascade` wrapper 剥 chrome（透明/无边框/overflow visible）只做定位；两列各自成卡（各自 bg/border/radius 14/shadow/高度），旧 inset 分隔线连体规则删除；provider 卡仍独占锚定高度（票 122 抗振荡不变量保留：hover 跨 3 providers bbox 恒定）；model 卡流外悬挂 right（left:196 = 190+6px 缝，z19 实测 ≈6px 阴影缝），顶缘贴被悬停 provider 行（z19-menu-2 像素取证：右列顶 91 = 高亮行 90..121 顶），高度帽 min(320, 视口底−8−顶)（122 x 钳制的竖向孪生，代码注释留档）。**②弹出卡贴钮**——align='chip' 的自校正 delta 转向扩出 y 轴：卡底 = chip 顶−2px（CHIP_HUG_GAP，z19 实测缝 ≈2px），基线规则改 `bottom:0`（calc 解析为 NaN，delta 法需有限 px），x 钳制宽度改级联全跨距（流外 model 卡计入，否则窄窗破窗）；thinking 卡同路径同规则；AccessMenu 不动（122 范围）。**验收证据**：visual mg1–mg5 全绿（exit 0）+ 目检对照 z19-menu-1/2 构图一致（两分离卡/不同高 106 vs 137/groove 6.0/model top==悬停行 503==503/卡底贴 chip 上缘 hug 2.0/左缘对齐 chip），帧已提交 `.scratch/visual/`；electron smoke `menu_geometry_122` 段（含 138 新断言：hug gap DOM 断言 2.0±1、分离断言、窄窗含 model 卡）在 3 次独立完整 run 全绿（anchor/cascade_stable/keyboard 真键/clamp/thinking 五腿），同 runs 的 menu_surface/chip_toggle/menu_keyboard（68/69/98）全绿，run-4 并通过 crash-isolation/follow/replay/newtask/multi-session 下游段；vitest 124 files / 2175 tests 绿（env -u）、typecheck 双 project 绿、改动文件 eslint 零输出。**披露一（环境）**：全套 run-all 未取单次端到端 ALL GREEN——阻塞全为预存 flaky 且与本 diff 零交集：host-contract Round K（ticket-101 live stop 超时）stash 基线 A/B 同位同败留档；electron 段死于操作员活跃焦点族（t132 boot ⌘J ×3、t105 焦点被夺 ×2、t89 OAuth 外开 ×1、t69 walk 真键重复 ×1）；pty/usage/interop/sanitized-spawn 单独重跑全绿。**披露二**：menu_surface 首轮一次 "/ default-default" 假失败——同代码复跑全段即绿且本 diff 对 slash 路径行为惰性（align='left' 早退），判环境一次性竞态。**披露三（裁量）**：model 卡顶对齐悬停行与视口竖向帽取自帧取证（票面只要求分离+贴钮，行对齐是 z19 构图的一部分）；空目录 model 卡同走贴钮路径（同组件一致性）。遗留：无（键盘/焦点/契约零改动面）。merge：请操作者 `bash scripts/merge-ticket.sh 138`。
