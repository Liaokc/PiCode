# 80: New Task 权限链补全——accessPick + 会话默认值增量

**What to build:** New Task 空态的权限选择真正生效（对照操作者痛点：菜单能点开、选择无反应）：EmptyState 增 **accessPick 本地态**（权限菜单 onPick 覆写为本地 set——chip 即时反映所选，对照票 41 的 model/thinking pick 链）；随任务创建参数下传、创建的会话以该档位运行；未选 = Pi fallback + "**default**" 小标（modelIsDefault 先例）；**跨重启不持久**（与 model/thinking pick 同型）。**additive 契约增量**：会话默认值结构增 `accessMode?` 字段（创建载荷携带；旧载荷缺字段照常校验通过）。

**背景（取证）：** EmptyState 只覆写了 model/thinking 两个 onPick，权限 onPick 透传到 sendFocused——New Task 无 host 时命令**静默丢弃**（票 41 补链漏项）；会话默认值结构无 accessMode 字段。file:line 级根因见 `../intake-grilling.md` R6 节。

**Blocked by:** 74（R6 与 R13 同改 EmptyState——文件冲突规避边；74 先落）.

**Status:** ready-for-agent

- [ ] Seam-1 会话默认值增量（accessMode 缺席兼容；有值时创建链路投影正确）
- [ ] host-contract smoke：`accessMode` additive 增量（旧载荷兼容）+ **实施时报备入账**
- [ ] electron smoke：New Task 选权限 → chip 即显 → 创建 → 会话 chip 与首回合档位正确；未选显 default 小标
- [ ] 跨重启不持久确认（与 model/thinking pick 同型）
- [ ] 纯 renderer + additive 契约；全英文文案
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
