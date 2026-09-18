# 109: visual 4e/4f fixture 排序免疫——当前 provider 改用 prov-11 + 全量 transcript 重捕获

**What to build:** 修复 `visual:transcript` stage 4e 的确定性失败（fixture 期望跨 rebase 失配）：4e/4f 的长列表 fixture 把「当前 provider」从 bella/GLM-5.3 改为 **prov-11 自带模型 m-11（"Provider 11"）**——prov-11 不在已配置集里，在**排序世界与未排序世界都位于 index 11**（排序免疫）；4f 的 `walked.selected === 13` 断言同样双世界成立。随后**重跑全量 `npm run visual:transcript` 全绿**，并重捕获 4e 失败后未曾刷新的 9 帧（4e-model-menu-locate / 4f-model-menu-scroll-bottom / 5-approval-queue / 5-preview-source / 6-preview-directory / 7-review-deeplink / 8-tooltip-filter / 9-nav-rail / 9-tab-dropdown——仍是带箭头旧标题栏基线）。**零产品代码改动、零契约增量**（纯 fixture/测试期望修缮）。

**背景（取证，合并会话取证 + intake 抽查复核通过）：** 根因 = 票 76 的 configured-first 排序（merge 9ebcccc，09-16 14:31）经 App chatForView 排序接进模型菜单；票 69 的 4e fixture（bella 塞 index 11、断言 `selected===11`）在 09-15 晚写成并跑绿；t69 分支 09-16 14:34 rebase 到含 76 的 main 后合入——**陈旧期望跨语义 rebase 原样带入，此后无人重跑全量 transcript**，直到票 85 验证撞死（85 Comments「预先存在缺陷记录」在案）。复现：`sortProvidersConfiguredFirst(fixture, {anthropic,openai,google,bella})` → bella 落第 0 位 = selected:0；`configuredIds=null` → 保持 11 = t69 绿。定性：**非 UX 回归**（排序后当前 provider 高亮且可见正是 76 获批行为），是测试期望失配；但 4e 令全量 harness 夭折、9 帧基线陈旧，且「当前 provider 深在列表的开屏滚动跟随」场景失去覆盖（4b 的 selected===0 断言对此天然盲）。**bisect T69→T83 不可行**——69 合并起每个 checkout 同型失败。流程教训（写本票 Acceptance/Comments，不单独立 ADR）：**跨语义 rebase 需重跑受影响 harness**。

**Blocked by:** None (can start immediately).

**Status:** wontfix

## Acceptance

- [ ] fixture 双世界论证留档：prov-11/m-11 在排序世界与未排序世界 index 均为 11（注释或表驱动 vitest 断言 `sortProvidersConfiguredFirst` 两种输入下 prov-11 的位置）
- [ ] 4e/4f 探针按新 fixture 全绿（4e `selected===11` + 滚动跟随 ok；4f walked===13 clamp）
- [ ] 全量 `npm run visual:transcript` 全绿（不中止）；9 帧重捕获且**标题栏条带无箭头残留**（85 后新基线）
- [ ] 零产品代码改动（diff 仅 src/main/visual.ts fixture 区 + .scratch/visual 帧）、零契约增量
- [ ] vitest / typecheck 全绿；全英文注释
- [ ] **流程教训入 Comments**：跨语义 rebase 需重跑受影响 harness（本缺陷的可预防点）
- [ ] 跑 harness 前 `ps` 自查（dev-app serialization）；electron 运行需 unset ELECTRON_RUN_AS_NODE + PATH 前置 /usr/local/bin（票 85 环境备注同款）

## Comments

- 2026-09-17 (intake 立项，合并会话取证 + 抽查复核)：根因链 = t69 验证（09-15 晚）早于 76 合入（09-16 14:31）、rebase 跨语义变更未重跑 transcript；**bisect T69→T83 不可行——69 合并起每个 checkout 同型失败**。交叉引用票 85 Comments「预先存在缺陷记录」。编号说明：合并会话移交时指定 108，但 108 已被 R29 计时票占用（全局连续纪律），本票顺延 **109**。
- 2026-09-18 (merge session，per 操作者裁决「翻转 109 Status 并注记」)：**撤票——内容已由票 87 顺带交付**（merge `b252842`，feat `9a3df7d`）。对账：
  - 修复形态差异：87 实现会话选 **prov-13（末行）+ composer_state 钉住 current**（chat reducer `state.model ?? event.current` 不被 models_available 覆盖），而非本票草案的 prov-11——同族排序免疫，且保留「深行定位」stage 意图（排序后 row 13）与 4f 末行 clamp；附基线复现（stash 改动后同型失败）。87 票内「顺手修 + 报备」Comments 在案。
  - 交付证据：`visual:transcript` **全量绿至 VISUAL done**（含修复后 4e/4f）；9 帧及 0→9 全系列重捕获（随 merge `b252842` 入库）；两张死证据帧 git rm。
  - 验收项覆盖：fixture 排序免疫 ✓（prov-13 双世界成立）、全量 transcript 绿 ✓、帧重捕获 ✓（标题栏无箭头残留随 85/87 新基线）、零产品代码改动 ✓（改动即 visual.ts fixture 区 + 帧）、流程教训 ✓（**跨语义 rebase 需重跑受影响 harness**——已留档于 87 Comments 与本票背景，教训存续）。
  - Status: ready-for-agent → **wontfix**（交付已发生、无剩余工作；非「不修」——缺陷已修，交付载体为 87）。
