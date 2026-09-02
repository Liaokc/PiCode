# 27: 键位重映射——⌘B 侧栏 / ⌥⌘B 面板 / ⌘J 终端 / ⌥⌘J Bridge

**What to build:** 全局快捷键对齐 ZCode 肌肉记忆：**⌘B** 打开/关闭左侧栏；**⌥⌘B** 打开/关闭右侧面板；**⌘J** 保持终端 dock；**⌥⌘J** 打开/关闭 Bridge dock。判定改用物理键位（`event.code`，规避 macOS Option 组合字符）；标题栏四个切换钮的 tooltip 按 R1 规则转键帽态（⌘B / ⌥⌘B / ⌘J / ⌥⌘J）。

**背景（取证）：** 现状 ⌘B = Bridge（findings 第三轮：ZCode 命令面板实拍 `/tmp/srch1.png` 标注「切换侧边栏 ⌘B」）；keydown handler 显式拒绝 altKey 组合。dock 开合动作复用既有动作（互切语义自然延续）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] ⌘B / ⌥⌘B / ⌘J / ⌥⌘J 四键按上述映射工作；⌥⌘J、⌥⌘B 原无占用，无冲突
- [ ] 判定用物理键位（event.code）；快捷键不漏进 Composer/输入框
- [ ] 标题栏侧栏钮 / 面板钮 / 终端钮 / Bridge 钮 tooltip 转键帽态（有快捷键只显键帽，R1）
- [ ] 键位解析纯函数表驱动（Seam-1）
- [ ] electron smoke 四键断言；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q5 定稿（操作者指定四条映射）。归类：全新需求（键位重映射）。波次：W1。
- 2026-09-02 (implement session): claimed → implemented → code-review (standards 0 findings / spec 0 findings) → committed on `t27-keymap-remap` as **9c71e85**. Seam-1 表驱动解析落在 `src/shared/keymap.ts`（12 vitest 用例：四键正向、⌥B→"∫"/⌥J→"∆" 物理键位回归、精确修饰符拒绝、表完整性）；App 全局 handler 改经 `resolveKeybinding`，处理过的键一律 preventDefault（不漏进 Composer/输入框）；标题栏四钮 tooltip 转 R1 键帽态（⌘B / ⌥⌘B / ⌘J / ⌥⌘J）；electron smoke 新增四键 stage（keymap_tooltips_ok / cmd_b_sidebar / alt_cmd_b_panel / cmd_j_terminal / alt_cmd_j_bridge / bridge_toggle_off）全过；smoke 的合成 ⌘N 事件补 `code: 'KeyN'`（物理键位判定的必然后果）。CONTEXT.md 桥接停靠词条绑定同步改 ⌥⌘J。typecheck / lint / vitest 669 全绿；electron smoke 0 FAIL。不自行 merge——请操作者执行 `bash scripts/merge-ticket.sh 27`。
