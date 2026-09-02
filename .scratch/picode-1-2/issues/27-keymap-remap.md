# 27: 键位重映射——⌘B 侧栏 / ⌥⌘B 面板 / ⌘J 终端 / ⌥⌘J Bridge

**What to build:** 全局快捷键对齐 ZCode 肌肉记忆：**⌘B** 打开/关闭左侧栏；**⌥⌘B** 打开/关闭右侧面板；**⌘J** 保持终端 dock；**⌥⌘J** 打开/关闭 Bridge dock。判定改用物理键位（`event.code`，规避 macOS Option 组合字符）；标题栏四个切换钮的 tooltip 按 R1 规则转键帽态（⌘B / ⌥⌘B / ⌘J / ⌥⌘J）。

**背景（取证）：** 现状 ⌘B = Bridge（findings 第三轮：ZCode 命令面板实拍 `/tmp/srch1.png` 标注「切换侧边栏 ⌘B」）；keydown handler 显式拒绝 altKey 组合。dock 开合动作复用既有动作（互切语义自然延续）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] ⌘B / ⌥⌘B / ⌘J / ⌥⌘J 四键按上述映射工作；⌥⌘J、⌥⌘B 原无占用，无冲突
- [ ] 判定用物理键位（event.code）；快捷键不漏进 Composer/输入框
- [ ] 标题栏侧栏钮 / 面板钮 / 终端钮 / Bridge 钮 tooltip 转键帽态（有快捷键只显键帽，R1）
- [ ] 键位解析纯函数表驱动（Seam-1）
- [ ] electron smoke 四键断言；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q5 定稿（操作者指定四条映射）。归类：全新需求（键位重映射）。波次：W1。
