# 72: 技能/模板卡——composer「卡+文本」结构

**What to build:** slash 菜单选中技能或 prompt 模板后，composer 不再留裸文本，渲染**结构化卡**（icon + 名称 + × 移除，形态对照 pi16-zcode-skill-card）：**单槽 + 替换**（Pi 语义一条消息一个行首命令——再选替换现有卡；卡在场时输入 `/` 仍开菜单，选中即替换）；参数文本跟卡后；发送时重组 `/skill:name args` / `/name args`——**发送语义与今天逐字节一致**（纯渲染层）；× 清卡；手打 `/skill:` 前缀可剥匹配菜单技能行（自家的插入形态搜得到自己的行，对照 pi16-slash-no-match-persist）；builtin（/compact）立即执行路径不变；prompt 模板同待遇。New Task 与会话内两处 composer 共组件同规则。

**背景（取证）：** skill 选中走 insert 纯文本路径；`skill:` 前缀使 fuzzy 必零匹配。ZCode 卡形态实拍 pi16-zcode-skill-card。file:line 级根因见 `../intake-grilling.md` R1 节。

**Blocked by:** 71（Lane A 收官位；触发面 68 + 键盘统一 69 是其基座）.

**Status:** ready-for-human

- [x] Seam-1「卡+文本」值结构与发送重组纯函数（含 `skill:` 前缀剥匹配——commands/fuzzy 套件扩展）——`shared/composer/commands.ts`：`ComposerCommandCard`/`cardInvocation`/`composeCommandText`（逐字节重组，单测锁形状）+ `stripSkillQuery` 入 `filterCommands`；`shared/composer/drafts.ts` 卡随草稿（空槽不存计卡）
- [x] New Task 与会话内两处同规则验收（共组件）——electron smoke：ticket-52 stage 空态选模板出卡零发送 + × 清卡（`command_catalog_card_zero_send_ok`/`command_catalog_card_clear_ok`）；ticket-72 stage 会话内全流程；visual `sc3-newtask-card` 帧双面同卡
- [x] electron smoke：选技能出卡 → 带参发送 → 会话内 SDK 正常展开；× 清卡；再选替换——`command_card_*` 8 步全绿；SDK 展开实证（持久化 user message = `<skill name="picode-72-skill"…>` 序言 + 原样参数）；全套件 exit 0（23 hosts 零孤儿）
- [x] visual harness：卡帧（对照 pi16-zcode-skill-card）——`npm run visual:skill-card`：`sc1-skill-card`（紫罗兰魔杖+名+×+参数）、`sc2-template-card`（×后重选替换为模板卡）、`sc3-newtask-card`（空态同规则）
- [x] 输入路径零 setState 纪律不破（票 49 expand 先例——高度/值更新走 imperative 路径）——卡状态只在 pick/×/send 变更，逐键零新增 setState；expand imperative 高度路径未触碰
- [x] 纯渲染层，零契约增量；全英文文案——IPC 契约零改动（draft 形状为 renderer 内 shared/composer 增量可选字段）；卡 aria/文案全英文；无 Tooltip（卡形态豁免）
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）——每次 electron 运行前自查；曾遇 wt-80 在跑（等待后重试）

**验收附注（顺带修复，超出票面）：** ① `MenuRow.onMouseEnter` 改为指针真实位移才更新悬停——键盘 walk 触发 scrollIntoView 时停在菜单上的物理指针会收到 scroll 诱导的边界事件、抢走键盘选中态（既有产品缺陷；electron smoke 因鼠标停靠位置间歇红，main 同样复现），修复后 walk 与全套件稳定绿；② ticket-72 smoke stage 摆位在票 74 之后——legacy crash-isolation stage SIGKILL「最近 spawn 的 host」并等首会话 host_exit，任何在其前 resume 会话的 stage 都会破坏该配对（73/74/77 同域）。
