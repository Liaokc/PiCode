# 97: 用户条目三合一——技能泡重构 + 气泡缩略图 + Edit 带图 live 还原

**What to build:** 用户消息泡升级为**组合块**（三段按存在性组合），一张票打通同渲染区段的三项需求：①**技能泡重构（R19）**——泡 = 技能渲染（魔杖 icon + Skill + 名字，有技能时）+ 用户文本（有时）+ 图片缩略图（有图时）；skill-only 泡内只渲染技能（空灰盒消失）、技能+文字泡内两者都渲染；**容器体内技能 marker 行退役**（不再双显——技能故事由泡承载，live/落定常驻；操作者批准的 ZCode 偏离：ZCode 把技能当容器内 work item）；Copy 语义不变（拷用户原话）；②**气泡缩略图（R17）**——已发消息的图片以缩略图条入泡，点缩略图开票 91 预览浮层；③**Edit 带图 live 还原（R14）**——host `user_message` echo 增图片部件（steer/follow-up echo 同修）→ reducer 落账 live 条目 → Stop 后即时 Edit 预填原文+原图。**additive 契约增量：user_message 事件 images 字段（缺席 = 无图消息照常；实施时报备入 host-contract smoke）**。

**背景（取证）：** 空泡 = `ChatView.tsx:311` 空串照渲染；marker 在容器体 = `TurnContainer.tsx:140-144`；live 条目 images ABSENT = `chat-reducer.ts:59-63`（「images reach the entry on the next replay」——票 79 只修了回放路径，host echo `host/index.ts:296/495` 只带 text）；回放侧图片投影已就绪（`parse.ts:309-317`）。三段同落用户条目/泡渲染区段，同增量同票。

**Blocked by:** 82（live 回合纯时间序——B 群串行）+ 91（图片预览浮层——缩略图点击的预览前置）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：泡组合块模型（技能/文字/图片三段存在性组合全表）+ chat-reducer live images 落账（echo 缺席兼容 = 无图消息条目形状不变）
- [x] **additive 报备**：user_message images 进 host-contract smoke（含旧载荷兼容）
- [x] electron smoke：skill-only 泡（技能渲染、无空盒）；技能+文字双段；带图消息气泡缩略图 + 点击开预览；**发送带图 → Stop → Edit → composer 原文+原图即时还原**（本次缺陷现场回归）；容器体内无 marker
- [x] Edit-resend 既有语义零回归（剥离 prologue、首条消息 resetLeaf、草稿替换）；Copy 拷用户原话不变
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；visual 泡帧

## Comments

- 2026-09-20 (implement session，分支 t97-user-entry @ main 470bc69 rebase 后含 82/91 基座，working tree)：三合一落地，TDD red→green，零回归闭环。取证链：
  - **Seam-1 泡组合块模型（`src/shared/user-bubble.ts` 新模块 + `tests/shared/user-bubble.test.ts`，全组合表）**：`userBubbleSegments(entry)` 按存在性序返 skill→text→images 三段——skill-only 只返技能段（空灰盒消失）、text 段走 `stripSkillPrologue` 原话、images 仅在非空数组时成段（缺席/空数组 = 无段，防御零段 = 不渲染泡）。11 例全表（plain/skill-only/skill+text/text+images/skill+text+images/skill+images/images-only/空/absent/empty-array/mismatch）。
  - **R14 live 落账（chat-reducer `user_message` case）**：echo 的 `images`（additive）非空才上 live 条目——缺席/空数组时条目形状与 pre-97 逐字节相同（`'images' in entry === false`，测试钉死）。UserEntry.images 文档同步改写（不再「ABSENT on live entries」）。additive 契约增量落 `contract.ts`：`user_message` 事件增 `images?: TranscriptImagePart[]`（复用 sessions/types 的 part 形状，replay/live 同构）。
  - **R14 host echo（`src/host/index.ts`）**：单一中继点 `relayDeliveredUserText` 增 images 参——`onMessageAppended` 用 **`userImageParts`（sessions/parse.ts 从私有导出，回放/live 单一投影源）** 从持久化 content 抽部件，prompt echo 与 **steer/follow-up 投递 echo 同路径同修**；`pendingEchoes` 升为 `{text, images?}[]`（按 text 匹配消费），**失败路径 `flushPendingEcho` 也回填图**（prompt 未持久化即败的现场）；`userMessageEcho` 只在非空时带字段——无图 echo 保持 pre-97 事件形状。
  - **R17 泡缩略图（`UserBubble.tsx` 新组件，ChatView + FollowView 同规则）**：52px `user-image-thumb` 复用票 91 全分辨率 data:URL 裁切纪律；点击开 `ImagePreviewOverlay`（`images+index+onNavigate+onClose` 最小接缝复用，泡本地视图态——遮罩全屏期只可能一个开）；零段泡不渲染（防御）。Copy 语义不变（MessageActions 仍传 `turn.userText`）。
  - **R19 marker 退役（turn-collapse + TurnContainer）**：容器体 marker 行删除（`skill-marker-row` CSS 一并替换为泡组合块样式）；`hasWork` 只看 `work.length > 0`（技能不再计体——skill-only 回合容器裸态不可展开，可展开 ⇔ 体非空保持诚实）；`hasContainer` 丢 skillName 子句（有 user 泡即有容器，语义不变）；`TurnGroup.skillName` 字段随之删除（唯一消费者就是 marker；泡从 entry 读，模型不留死字段）。FollowView 同步换 UserBubble（回放条目带票 79 投影图片，泡缩略图同规则）。
  - **host-contract smoke 报备（Round A 内嵌，真模型真持久化路径）**：①round-1 prompt 带图 → `agent_end 1` 处断言 echo 携带形状合法的非空 image parts（`prompt echo images ok`）；②round-2 无图 prompt → echo 保持无字段旧形状（`imageless echo shape ok`，加性纪律：缺席非空数组）；③steer 带图 → 投递 echo 携带部件（`steer delivery echo images ok`，同修红线）；全局 handler 对每个 user_message 做形状校验。**调试取证**：首次运行失败根因是**冒烟脚本自己发了 `images: [base64String]`（裸字符串非 ImageAttachment 形状）**，host `toImageContents` 忠实映射出 `{type:'image'}` 半残块，`userImageParts` 防御性拒投影——**防御设计按立法工作，echo 宁缺毋假**（改成正确形状后全绿；probe 脚本双取证：正确形状下 echo/persisted content 均带图）。
  - **electron smoke 票 97 阶段（bubble_trio，紧随 ticket-79 阶段）**：seeded 会话（skill-only / skill+text / text+image 三 user + replies）→ ①组合表 DOM 断言（`bubble_composition_ok`：三泡 skill/text/thumbs 计数精确匹配 + 全转录 `skill-marker-row` = 0，含容器全开态）；②泡缩略图点击开票 91 浮层 + Esc 关（`bubble_thumb_preview_ok`）；③**R14 缺陷现场回归**：composer 真粘贴图 + 真模型回合 → 等 echo 事件**携带 images**（契约层断言）→ live 泬即时出缩略图（`bubble_live_echo_images_ok`）→ Stop → agent_end → 点 Edit → composer 原文逐字节 + 1 附件即时还原（`bubble_edit_with_images_ok`）。**票 79 阶段原①–⑥不改一字全绿**（Edit-resend 语义零回归：草稿替换/resetLeaf/图片预填/Stop 恢复/树分支），票 44 Copy-first 行形状阶段照绿（Copy 语义不变）。
  - **visual 泡帧（`src/main/visual-bubble.ts` + `visual:bubble` script）**：b1（技能两形）/b1b（图+plain）/b2（泡缩略图开浮层 + Esc 关），探针断言全组合表 + marker 零残留，帧入册 `.scratch/picode-1-7/visual-t97/b1-composite-bubbles.png`、`b1b-composite-bubbles-bottom.png`、`b2-bubble-preview.png`（harness 原始输出在 .scratch/visual/ 同名）。
  - **验证闭环**：vitest 1758/1758 全绿（新增 11 泡表 + 3 reducer 落账 + 2 turn-collapse 改写）；typecheck 双 tsconfig 清；eslint 本票新文件零告警（ChatView:171 的 no-use-before-declare 与其余 10 项均为 main 既有，stash 对照确认）；`npm run smoke:electron` **exit 0**（run final，ps 自查无并行 dev app）；`npm run smoke:host` **exit 0**（三报备断言全绿）；dev-app serialization：每次 smoke/visual 前 `ps` 自查。
  - CONTEXT.md 词条四条入册：**用户泡（组合块）**、**泡缩略图**、**技能泡退役**（含操作者批准 ZCode 偏离）新增，**工作容器**（技能不计体）、**图片预览浮层**（票 97 复用落地 + 泡内焦点回开启钮注记）、**编辑重发**（live 条目即时带图）修订。
- 2026-09-20 (code-review，/code-review 双轴并行 reviewer 子代理，workflow 041d8a79，base main…HEAD @ 470bc69 固定点)：**Standards：BLOCK→已修（一项 P1）**；**Spec：OK（一项 P2 注记，report-only）**。
  - **Standards P1（已修，commit c0523fd）**：legacy `visual:transcript` 的 3c-replayed 探针仍断言容器体内恰一 `.skill-marker-row`——票 97 退役 marker 后该探针必挋（`npm run visual:transcript` 每跑必抛）。修法：探针改断**技能故事入泡**（`.user-skill-row === 1`）+ **退役 marker 零残留**（`=== 0`，容器全开态）；通用签名的 `skills` 字段重指向泡技能行并增 `markers` 字段。修后 `npm run visual:transcript` 全套 exit 0（probe 3c-replayed `skills:1,markers:0`，其余签名原样）。
  - **Standards 判断题×2（record-only 不阻塞）**：① `stripSkillPrologue` 双重派生（turn-collapse 的 userText 与 user-bubble 模型各算一次）——保留：模型接缝刻意以 entry 为唯一输入（表测试覆盖全组合），TurnGroup.userText 服务 Copy/导航预览消费者；同一纯函数，行为零漂移风险。② `pendingEchoes` 仍按 text 匹配但如今携带 images 载荷——票前就是 text 匹配纪律（票 51 既有），本票只增载荷；host 保证单在途 prompt（run in flight 守卫），留档待未来队列扩展时换 key 绑定。
  - **Spec P2（report-only）**：新 visual harness（`visual:bubble`）不在 spec.md:328 的 visual-harness 清单内——票验收项「visual 泡帧」自行授权，无害留档。
  - **Spec 轴零缺失零走样**：R19/R17/R14 三需求逐条过源码验证（含 Copy 语义不变、泡不进容器流、Edit 行不动、additive 缺席纪律、报备三断言）；reviewer 无 shell，测试/typecheck/smoke 由本会话补跑闭环（vitest 1758 / typecheck 清 / smoke:host exit 0 / smoke:electron exit 0 / visual:transcript + visual:bubble exit 0，均见上行证据链）。
