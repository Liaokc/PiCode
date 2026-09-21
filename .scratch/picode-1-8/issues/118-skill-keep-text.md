# 118: 技能选中保留既有文本——只剥离触发 token

**What to build:** slash 菜单选中技能卡（`pickTextMenuRow` card 分支）**不再清空输入框**——只剥离触发 token（`/query`），其余文本保留为卡后参数；caret 落余文原位；发送重组 `composeCommandText(card, value)` 零改动（与裸文本时代逐字节一致）。`menu-surface.ts` 触发面规则不动（先有文本回开头打 `/` 菜单照常开）。`CONTEXT.md` 技能卡词条随票修订（补既有文本共存语义）。

**背景（取证）：** `Composer.tsx` pickTextMenuRow card 分支 `setCard(decision.card); updateValue('')`——**清空整框**。注释自辩「菜单开着时 value 必为触发 token」，但 `shared/composer/menu-surface.ts:36` 触发面 = 首行首字符 `/` + caret 前无空白即开——先有文本再回开头打 `/` 时整段首行被当 query token，选中即全清（操作者实测：「回到最开头输入skill然后选中，文本输入框的内容全没了」）；图片是独立 state 幸存。与 CONTEXT.md 技能卡词条「参数文本跟卡后」语义对齐 = 余文本就该是参数。

**Blocked by:** 117（同文件群强串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：余文剥离表驱动（有/无前导文本 × caret 位 × 图存在；触发 token 边界 = 首个空白或串尾）
- [ ] electron smoke：输入文本 → 回开头选技能 → 文本保留为卡后参数、图片不丢；发送重组与裸文本逐字节一致（smoke 断言）
- [ ] 手打 `/skill:` 前缀剥离路径（既有）与 × 移除路径（既有）不回归
- [ ] CONTEXT.md 技能卡词条修订随票入册
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P8 定稿为 R7。根因 file:line：`updateValue('')` + menu-surface 触发面整段首行当 token。修法唯一（剥离保留）免问。
