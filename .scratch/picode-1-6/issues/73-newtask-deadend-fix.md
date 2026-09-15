# 73: New Task 死端修复——会话行点击必达

**What to build:** New Task 空态下点侧栏**任何会话行必然离开 New Task 主区**、主区切到目标会话：会话行打开路径的「已聚焦」与「在应用内（注册表活 host）」两分支补清 New Task 态标志（现在只切了注册表焦点，主区仍渲染空态——对照操作者痛点「点了没反应」）；跟随（Live Follow）与 resume 路径已有清理、不回归；灰行解释 toast 路径不回归。

**背景（取证）：** 会话行打开 handler 的前两分支缺 New Task 态清理；主区渲染条件以 New Task 态优先——焦点在后台换了、界面不动。file:line 级根因见 `../intake-grilling.md` R9 节。回归级可用性缺陷。

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] electron smoke：New Task 态点活会话行 / 已聚焦行 / 非在应用行——三类都切走主区
- [ ] Live Follow / resume / 灰行 toast 路径不回归
- [ ] 纯 renderer 状态修，零契约增量
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
