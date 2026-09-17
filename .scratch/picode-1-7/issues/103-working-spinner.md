# 103: working 转环增强——展开态底部加环、两处更醒目

**What to build:** live 时的工作指示增强：①容器**展开态**：容器体底部新增同款转环（左对齐于体底缘，与顶部 header 的转环镜像——「还在工作」在头尾都可见）；②容器**折叠态**：维持 header 单环位置不变；③**两处转环增强可见性**——更大直径 + 品牌强调色/不透明（具体参数 visual harness 校准、票内裁量）；④仅 live（落定无环）；FollowView 同规。纯视觉层零契约。

**背景（取证）：** 现状 = header 左侧单个小转环（`TurnContainer` header 行），展开态体底无指示、且环本身偏小偏淡——操作者原话：「worked 容器最底部也增加一个，然后明显一点…折叠的时候就还是现在这样子，但是圆环也希望明显一点」。

**Blocked by:** 94（工作容器折叠锚定——同 TurnContainer 区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：live 展开态 = header 环 + 体底环两处存在；落定后两环消失；折叠态仅 header 环
- [ ] 可见性增强上屏（更大/强调色）——visual 留档对照帧（操作者验收以实视为准）
- [ ] FollowView 同规；票 55/56 容器语义（零工作项 inert、落定折叠）零回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
