# 70: chip 弹层开关竞态修复——Access/Model/Thinking 再点必收

**What to build:** 权限/模型/思考三 chip 点开弹层后**再点 chip 本体必收起**（toggle 语义成立）；弹层的 document 级 mousedown 外点关闭**豁免 owning chip**——mousedown 落在打开该弹层的 chip 内则不关，交给 chip 自身 click toggle 收起；真外点仍关、弹层内点击不误关、点弹层内行选择正常。实现形态（ref 回传/事件标记/stopPropagation）由票裁量。

**背景（取证）：** 弹层挂 document 级 mousedown 外点关闭；点 chip 本体时 mousedown 先关菜单 → 重渲染 → click 落到 `menu===null` 的 toggle 分支又弹开——关了又开=「点不收」。file:line 级根因见 `../intake-grilling.md` R4 节。

**Blocked by:** 69（同菜单模块串行）.

**Status:** ready-for-agent

- [ ] electron smoke：三 chip 各自「开→再点本体→收」；真外点关闭；弹层内点击不误关
- [ ] chip toggle 行为测试（组件测试或表驱动，由票裁量）
- [ ] 纯 renderer 改动，零契约增量
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
