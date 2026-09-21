# 118: 技能选中保留既有文本——只剥离触发 token

**What to build:** slash 菜单选中技能卡（`pickTextMenuRow` card 分支）**不再清空输入框**——只剥离触发 token（`/query`），其余文本保留为卡后参数；caret 落余文原位；发送重组 `composeCommandText(card, value)` 零改动（与裸文本时代逐字节一致）。`menu-surface.ts` 触发面规则不动（先有文本回开头打 `/` 菜单照常开）。`CONTEXT.md` 技能卡词条随票修订（补既有文本共存语义）。

**背景（取证）：** `Composer.tsx` pickTextMenuRow card 分支 `setCard(decision.card); updateValue('')`——**清空整框**。注释自辩「菜单开着时 value 必为触发 token」，但 `shared/composer/menu-surface.ts:36` 触发面 = 首行首字符 `/` + caret 前无空白即开——先有文本再回开头打 `/` 时整段首行被当 query token，选中即全清（操作者实测：「回到最开头输入skill然后选中，文本输入框的内容全没了」）；图片是独立 state 幸存。与 CONTEXT.md 技能卡词条「参数文本跟卡后」语义对齐 = 余文本就该是参数。

**Blocked by:** 117（同文件群强串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：余文剥离表驱动（有/无前导文本 × caret 位 × 图存在；触发 token 边界 = 首个空白或串尾）
- [x] electron smoke：输入文本 → 回开头选技能 → 文本保留为卡后参数、图片不丢；发送重组与裸文本逐字节一致（smoke 断言）
- [x] 手打 `/skill:` 前缀剥离路径（既有）与 × 移除路径（既有）不回归
- [x] CONTEXT.md 技能卡词条修订随票入册
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P8 定稿为 R7。根因 file:line：`updateValue('')` + menu-surface 触发面整段首行当 token。修法唯一（剥离保留）免问。
- 2026-09-22 (implemented, self-reviewed)：分支 `t118-skill-keep-text` tip `9cc1dd944cbbaa5ea7936fd88105306cb7a1cd5e`（实现提交；票面翻转与 sc4 视觉帧随其后小笔提交）。变更：① `shared/composer/commands.ts` 新增 `stripTriggerToken(text, caret)`（Seam-1 纯函数）+ `CommandPickText`：触发 token = `/`+查询（止于 caret——menu-surface 自己的 query 定义）+ 紧随其后分隔空白 run（首个空白或串尾边界）；余文 = `slice(caret)` 去前导空白；caret 落余文开头。② `Composer.tsx` pickTextMenuRow card 分支 `updateValue(kept.value, kept.caret)`；单一 pick 路径（票 69）与 117 的 reveal/prefill 接缝零扰动；builtin 分支、× 移除、`composeCommandText`/`stripSkillQuery` 零改动。③ 表驱动 vitest（无/有前导文本 × caret 位：粘接/CJK/空格/换行/制表分隔/中途 caret/全空白尾 + 域外 clamp + 与 composeCommandText 逐字节重组闭环）。④ smoke 新增 `skill_keep_text_118` 阶段（117 后）：草稿+1 图 → 回开头打 `/picode-118` → pick → 断言整段草稿保留为卡后参数、图片幸存、caret=0 → 发送 SDK 扩张含 `<skill name=…>` + 精确 args → 全重置。⑤ CONTEXT.md 技能卡词条补「既有文本共存」。⑥ `visual-skill-card.ts` harness 增 sc4-keep-text 帧（操作者复现场景：先打草稿→回开头 pick→草稿整段保留；探针断言卡 + value===草稿；帧落 `.scratch/visual/sc4-keep-text.png`）。
  - 边界裁决说明：粘接场景（先有文本回开头打 `/`，无分隔空白）下 token 止于 caret——若止于首个空白会吞掉粘在 token 后的首词（CJK 场景近乎全吞），操作者复现场景要求整段保留；分隔空白随 token 剥离否则重组出双空格破坏逐字节一致。
  - 「图存在」维度：图片是独立 state、非 seam 输入（pick 路径从不调 setImages），由 smoke 断言幸存，表内注释说明。
  - 验证链：vitest 2037/2037 全绿；typecheck 双 project 绿；electron smoke 本票阶段五步全绿（取证跑：阶段块临时前移到 t44 之前跑绿后 cp 复原，diff 逐字节一致，git diff --numstat = 188 插 0 删单一块——t129/t117/t125 手法，因 t44 需真实窗口焦点、操作者活跃时 macOS 拒绝 steal，两次跑均死在 t44，为已知环境事实）。t44 之后各段（含票 52/72 回归段）在本环境不可达：52/72 的 pick 断言在本 diff 下构造性保持真（纯 token 值 pick → 余文仍为 ''），stripSkillQuery 单测全绿。visual:skill-card 四帧全绿（含新 sc4）。
