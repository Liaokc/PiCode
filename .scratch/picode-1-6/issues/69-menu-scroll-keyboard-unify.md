# 69: 菜单滚动跟随 + 键盘处理统一

**What to build:** 菜单选中行随键盘导航**滚动入可视区**（scrollIntoView nearest——对照 pi16-menu-no-scroll：灰底选中行压在列表底缘、下一项被裁切、列表不动）；composer 侧文本菜单键盘处理与弹层键盘处理**统一为一处实现**（一处管 clamp/取模，消除双轨——现两套并存且实际生效的是 ArrowDown 无界版）；四类菜单（斜杠/文件/权限/模型/思考）键盘行为一致；hover 驱动同一选中模型的既有行为不回归。

**背景（取证）：** MenuRow 全链无 scrollIntoView；两套键盘处理并存（composer 拦截版无界 + flatMenuKey 取模版被屏蔽）。file:line 级根因见 `../intake-grilling.md` R3 节。

**Blocked by:** 68（统一落在 68 重写后的菜单键盘路径上——同函数区段强串行）.

**Status:** ready-for-agent

- [ ] Seam-1 键盘边界规则测试（统一后的单处实现：clamp/取模一处管）
- [ ] electron smoke / visual harness：长列表键盘导航选中行始终可见（对照 pi16-menu-no-scroll 帧）
- [ ] 斜杠/文件/权限/模型/思考菜单键盘行为一致（↑↓ 循环或钳制规则单一）
- [ ] hover 驱动选中不回归
- [ ] 纯 renderer 改动，零契约增量；全英文文案
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
