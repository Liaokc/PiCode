# 103: working 转环增强——展开态底部加环、两处更醒目

**What to build:** live 时的工作指示增强：①容器**展开态**：容器体底部新增同款转环（左对齐于体底缘，与顶部 header 的转环镜像——「还在工作」在头尾都可见）；②容器**折叠态**：维持 header 单环位置不变；③**两处转环增强可见性**——更大直径 + 品牌强调色/不透明（具体参数 visual harness 校准、票内裁量）；④仅 live（落定无环）；FollowView 同规。纯视觉层零契约。

**背景（取证）：** 现状 = header 左侧单个小转环（`TurnContainer` header 行），展开态体底无指示、且环本身偏小偏淡——操作者原话：「worked 容器最底部也增加一个，然后明显一点…折叠的时候就还是现在这样子，但是圆环也希望明显一点」。

**Blocked by:** 94（工作容器折叠锚定——同 TurnContainer 区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：live 展开态 = header 环 + 体底环两处存在；落定后两环消失；折叠态仅 header 环
- [x] 可见性增强上屏（更大/强调色）——visual 留档对照帧（操作者验收以实视为准）
- [x] FollowView 同规；票 55/56 容器语义（零工作项 inert、落定折叠）零回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implement session)：实现 = `TurnContainer.tsx`（header 环 13→16px 位置不动；展开体末尾 `.turn-container-live-foot` 同款环，`turn.live` 门控——折叠/零工作体不挂载时自然只剩 header 环，落定双环同消）+ `app.css`（`.turn-container-icon`/`.turn-container-foot-icon` 共用一条 `--accent-orange` 规则）；FollowView 复用同组件零改动继承（纯视觉零契约，无 IPC 改动）。**验证链**：typecheck 双 tsconfig 清；vitest 1836/1836（112 文件，复跑两轮全绿）；visual:worked 全绿 exit 0——wc2（静默期折叠=仅 header 环）、wc4（live 展开=双环，探针断言 `spinnerColor === accentColor`（浏览器运行时解析 var(--accent-orange)，非硬编码 rgb）+ 16px）、wc5（折叠中=1+0）、wc6（落定=0+0），留档帧 `.scratch/visual/wc4-spinner-expanded.png` 等 6 张；**electron smoke 全套（stage 1–6）EXIT=0**——ticket-55 stage 新增探针 `worked_container_spinners_live_expanded_ok`（展开 1+1）、折叠探针（1+0，并入 fold waitForProbe）、`worked_container_spinners_settled_ok`（落定 0+0）全过；首跑 scroll75 段因模型空响应超时（模型侧抖动，早于本票触碰面），重跑全套全绿。**code-review 双轴**（review-standards + review-spec 并行）：spec 轴无缺失/无实现错误（仅 role=status 记为轻微越界）；standards 轴无硬违反（4 条判断性意见）——已修：role=status 去除、强调色 CSS 合并单规则、wc4 断言改运行时 var 对照、fail 标签归位 ticket-55、CONTEXT.md「工作容器」词条补转环一句；SIG 签名在 smoke/visual 双 harness 的重复系 harness 各自独立既定形态，维持不改。ps 自查在案（首跑前无 app；后段检出 wt-104 并行窗口，visual 短跑仍 exit 0 无干扰）。
- 2026-09-21 (merge session，per 操作者验收指令「103 工单已验收」)：Status 翻转 ready-for-human + 四验收框按 Comments 既有证据链勾选（实现含 wc2–wc6 探针矩阵与双环构图 / verification：vitest 1836 两轮 + smoke 全套 EXIT=0 + code-review 双轴已修项含词条补记）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。「工作容器」词条转环补记已随票，合并时核对。
