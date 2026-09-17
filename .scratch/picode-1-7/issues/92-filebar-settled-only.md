# 92: 回合文件条 settled-only

**What to build:** 回合文件条改为**落定后才显示**：live 全程不渲染条；agent_end 落地瞬间原位出现（正文下方/容器后，构图不变）；**Stop/中断/出错回合照出条**（文件更改是事实投影，与回合成败无关）；FollowView 同规则。

**背景（取证）：** 现行为 = 票 78 交付「live 随工具落定增长」——`turn-collapse.ts:114`（live turn 携带 fileChanges）+ `ChatView.tsx:354`（`fileChanges.length>0` 即渲染，无 settled 门）；操作者真实使用判为干扰（1.7 第一条痛点）。

**Blocked by:** 82（live 回合纯时间序——同 turn-collapse/ChatView 区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：live 回合不携带 fileChanges（分组模型门）；落定回合照常聚合——票 78 全部聚合语义（edit ± 解析/write "+new"/同文件合并/read 排除/无更改无条）零回归
- [ ] electron smoke：live 无条 → agent_end 落地原位出现；**Stop 中断回合条照出**；无更改回合无条
- [ ] FollowView 同规则（settled-only 投影）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
