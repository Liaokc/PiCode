# 72: 技能/模板卡——composer「卡+文本」结构

**What to build:** slash 菜单选中技能或 prompt 模板后，composer 不再留裸文本，渲染**结构化卡**（icon + 名称 + × 移除，形态对照 pi16-zcode-skill-card）：**单槽 + 替换**（Pi 语义一条消息一个行首命令——再选替换现有卡；卡在场时输入 `/` 仍开菜单，选中即替换）；参数文本跟卡后；发送时重组 `/skill:name args` / `/name args`——**发送语义与今天逐字节一致**（纯渲染层）；× 清卡；手打 `/skill:` 前缀可剥匹配菜单技能行（自家的插入形态搜得到自己的行，对照 pi16-slash-no-match-persist）；builtin（/compact）立即执行路径不变；prompt 模板同待遇。New Task 与会话内两处 composer 共组件同规则。

**背景（取证）：** skill 选中走 insert 纯文本路径；`skill:` 前缀使 fuzzy 必零匹配。ZCode 卡形态实拍 pi16-zcode-skill-card。file:line 级根因见 `../intake-grilling.md` R1 节。

**Blocked by:** 71（Lane A 收官位；触发面 68 + 键盘统一 69 是其基座）.

**Status:** ready-for-agent

- [ ] Seam-1「卡+文本」值结构与发送重组纯函数（含 `skill:` 前缀剥匹配——commands/fuzzy 套件扩展）
- [ ] New Task 与会话内两处同规则验收（共组件）
- [ ] electron smoke：选技能出卡 → 带参发送 → 会话内 SDK 正常展开；× 清卡；再选替换
- [ ] visual harness：卡帧（对照 pi16-zcode-skill-card）
- [ ] 输入路径零 setState 纪律不破（票 49 expand 先例——高度/值更新走 imperative 路径）
- [ ] 纯渲染层，零契约增量；全英文文案
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
