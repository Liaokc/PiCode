# 116: 展开态输入高度稳定——typing-commit 按 expandState 分流

**What to build:** composer 高度 layout effect 的 typing-commit 路径按 `expandState` 分流——**展开态**输入/删除不缩高（重投影 `composerExpandHeight(mainRegionHeight(el))`，expandState 不变）；**收起态**维持既有 auto-grow（74–160px 钳制）。缩矮的唯一触发 = toggle / Esc / ⌘E / 发送成功（expand 状态机语义不变，`shared/composer/expand.ts` 状态机零改动）。

**背景（取证）：** `Composer.tsx` 高度 layout effect 的 typing-commit 路径**不检查 expanded**——每次 value 变更都跑 `composerAutoGrowHeight`（`shared/composer/expand.ts` 钳制 74–160px）。展开态（~400px）下敲一个键 → 高度被打回 ≤160px，但 `expandState` 仍是 'expanded'（右上角还是缩小钮——操作者图11 现场逐字吻合：「正常来说是输入框拉长之后才会有缩小按钮，说明我没有点击缩小」）。**操作者补充：删除字符同症**（同一路径，value 变更即触发）。

**Blocked by:** 无（composer 群首票）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：typing-commit 高度分流决策表（expanded × 输入/删除；collapsed 回归）表驱动进 `expand.ts` 或票内纯函数
- [ ] electron smoke：展开态输入与删除高度稳定（≥280px 不缩）；收起态 auto-grow 74–160 不回归；发送后收回（'sent'）不回归
- [ ] 展开态窗口 resize 重投影路径（既有）不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P12 + 操作者补充（删除字符同缩）定稿为 R11。根因 file:line：typing-commit 路径无 expanded 分支。修法唯一免问。同文件群串行首票（116→117→118）。
