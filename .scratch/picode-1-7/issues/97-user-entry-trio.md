# 97: 用户条目三合一——技能泡重构 + 气泡缩略图 + Edit 带图 live 还原

**What to build:** 用户消息泡升级为**组合块**（三段按存在性组合），一张票打通同渲染区段的三项需求：①**技能泡重构（R19）**——泡 = 技能渲染（魔杖 icon + Skill + 名字，有技能时）+ 用户文本（有时）+ 图片缩略图（有图时）；skill-only 泡内只渲染技能（空灰盒消失）、技能+文字泡内两者都渲染；**容器体内技能 marker 行退役**（不再双显——技能故事由泡承载，live/落定常驻；操作者批准的 ZCode 偏离：ZCode 把技能当容器内 work item）；Copy 语义不变（拷用户原话）；②**气泡缩略图（R17）**——已发消息的图片以缩略图条入泡，点缩略图开票 91 预览浮层；③**Edit 带图 live 还原（R14）**——host `user_message` echo 增图片部件（steer/follow-up echo 同修）→ reducer 落账 live 条目 → Stop 后即时 Edit 预填原文+原图。**additive 契约增量：user_message 事件 images 字段（缺席 = 无图消息照常；实施时报备入 host-contract smoke）**。

**背景（取证）：** 空泡 = `ChatView.tsx:311` 空串照渲染；marker 在容器体 = `TurnContainer.tsx:140-144`；live 条目 images ABSENT = `chat-reducer.ts:59-63`（「images reach the entry on the next replay」——票 79 只修了回放路径，host echo `host/index.ts:296/495` 只带 text）；回放侧图片投影已就绪（`parse.ts:309-317`）。三段同落用户条目/泡渲染区段，同增量同票。

**Blocked by:** 82（live 回合纯时间序——B 群串行）+ 91（图片预览浮层——缩略图点击的预览前置）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：泡组合块模型（技能/文字/图片三段存在性组合全表）+ chat-reducer live images 落账（echo 缺席兼容 = 无图消息条目形状不变）
- [ ] **additive 报备**：user_message images 进 host-contract smoke（含旧载荷兼容）
- [ ] electron smoke：skill-only 泡（技能渲染、无空盒）；技能+文字双段；带图消息气泡缩略图 + 点击开预览；**发送带图 → Stop → Edit → composer 原文+原图即时还原**（本次缺陷现场回归）；容器体内无 marker
- [ ] Edit-resend 既有语义零回归（剥离 prologue、首条消息 resetLeaf、草稿替换）；Copy 拷用户原话不变
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；visual 泡帧
