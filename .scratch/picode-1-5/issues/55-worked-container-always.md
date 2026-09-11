# 55: Worked 容器常驻化——每回合必有、空体不可展开

**What to build:** 每个有用户气泡的回合**必有工作容器**：live 期 "Working · Ns"（首个工作项出现前也常驻——顺带消除静默期转录区无反馈），落定 "Worked · Ns"（回放回合无时长，沿用票 14 规则只显 "Worked"）；**零工作项回合**（无 thinking/工具/审批/过程叙述，如纯文本寒暄回合）容器体为空且**不可展开**——无 chevron、点击无响应（可展开 ⇔ 体非空，Q12 拍板 A）；正文仍常显容器外，「回合正文」词条不动。**ZCode 偏离记录**：ZCode 零工作回合不渲染容器（bundle 实证 `u ? … : null`），操作者裁决常驻——「正文输出也算 work 阶段，容器不允许消失」。FollowView 同规则。

**背景（取证）：** 现渲染条件 `(hasWork || live)` 造成零工作回合 live 空壳 "Working·1s"、落定整体卸载——一显一隐像数据丢失（pi15-empty-worked-container）。01a0810d 会话 16 回合中 2 个零工作项（entry 272→273 / 292→293），历史 14 个有工作项回合全部显容器——操作者感知的「历史都有、PiCode 发送的没有」即源于此不对称。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 回合分组投影修订：有用户气泡回合必有容器 + 空体标志（表驱动：零工作 live / 零工作落定 / 零工作回放 / 有工作各态 / HEAD 回合维持现状）
- [x] 空体不可展开：无 chevron、点击无响应、aria-disabled；有工作项时 chevron 与展开行为照旧（可展开 ⇔ 体非空）
- [x] ChatView 空壳条件移除，由新规则取代；FollowView 同投影零开关
- [x] 容器级计时跨折叠保持（折叠重开 Working·Ns 连续不归零——容器本体不因折叠卸载）
- [x] electron smoke：零工作项回合 Worked 行落定后仍常驻（对照 pi15-empty-worked-container 场景）
- [x] visual harness：零工作落定帧（对照 pi15-empty-worked-container）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 55`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R5，Q10 两度澄清后操作者裁决 + Q12=A）。**56 强串行于本票**（同文件：回合分组纯模型 + 容器渲染条件）。波次 W1。术语「工作容器（Worked Container）」随票入 CONTEXT.md（操作者批准的 ZCode 偏离在词条与 spec 双记录）。性能红线：纯模型改动零额外转录重渲染（票 30/46/53 memo 先例）。
- 2026-09-11 (implement, t55-worked-container-always @ fa6404d): 全验收项落地。
  - **Seam-1 纯模型**（`src/shared/turn-collapse.ts`）：`TurnGroup` 增 `hasContainer`（有用户气泡回合恒真；HEAD 回合维持票 23 现状 `hasWork || live`——空头段不渲染、带工作/流中的头段照旧）；`hasWork` 双职为空体标志（可展开 ⇔ hasWork，Q12=A）。表驱动 7 例（零工作 live/落定/回放、有工作两态、skill-only 体、HEAD 空段/带工作/live 三腿）+ 改写原「no container」断言为票 55 语义；vitest 1113/1113。
  - **渲染**：ChatView `(hasWork || turn.live)` 空壳条件删除，改 `turn.hasContainer`；FollowView 同投影零开关；TurnContainer `expandable = turn.hasWork` 门控 chevron/onClick/aria-expanded/aria-label，`aria-disabled` 惰性行，`.turn-container-open` 类与容器体同门（类 ⇔ 体可见）；CSS 惰性行去 pointer 光标与 hover 供affordance。容器本体跨折叠不卸载（仅体卸载）——计时在落定后冻结保留（"Worked · Ns"），回放无时长（票 14）。纯模型改动零额外转录重渲染。
  - **术语**：CONTEXT.md「工作容器（Worked Container）」入册，偏离记录双写（词条 + 本票/spec R5）。
  - **electron smoke**：新 ticket-55 段（contract stream 注入，无模型调用）——回放零工作行 "Worked" 无时长、点击惰性（点击后 400ms 复核不开）、live 静默期 "Working" 行在、落定行常驻带时长、**带工作 live 回合折叠重开计时不归零**（1s→2s 连续——容器本体不因折叠卸载的直接证据）；五步全过。首跑在该段之后撞票 52 command_catalog 段（"/picode-smoke-template menu row is missing"）——与本票改动无因果（本段完成后才进入该段；该段自身 bareRows=0 显示 catalog 在 ②③ 间已空，属其既有 race 类，见 40c4160 返工史）；另两次分别撞票 25 deny reason 回传尾字 'y' 与一次 provider turn_error（host 层模型调用失败）——三处均为真实模型调用套件的既有 timing/provider flake（各在其余跑次全绿），复跑全链 ALL GREEN。ps 自查在每次 app 通道前执行，零撞锁。
  - **visual harness**：`PICODE_VISUAL_WORKED=1`（`npm run visual:worked`），断言式（违规 exit 1）——wc1 回放零工作落定帧 / wc2 live 静默帧（"Working · 1s" 惰性行）/ wc3 落定帧（"Worked · 2s" 常驻 + 回放 "Worked" 对照），对照 pi15-empty-worked-container 双半帧。基座 visual harness 在本 gate 置位时让位（首跑曾同窗竞争致基座 0*.png 帧被污染，已 `git checkout` 还原基线帧并给 visual.ts 补 stand-down——两帧集零交集）。
  - **交接给合并会话**：`.scratch/picode-1-5/`（spec/intake/issues 54、56–62）尚无 main 基线（fcb1dbc 先例的 baseline commit 未发生）——本分支只提交了本票文件 55；merge 前建议操作者/合并会话先在 main 提交 1.5 tracker 基线（或把本票文件按 e07367a「sync terminal state」惯例先同步进 main），否则 merge-script:50 的 ready-for-human 闸门对本票跳过（ls-files 查不到）。scripts/merge-ticket.sh 的 picode-1-5 路径补充系操作者待办，本分支未代劳（root worktree 已有未提交的同款改动）。
- 2026-09-11 (merge, T00 合并会话): **merged as 3a05644**（merge --no-ff；分支 feat 提交 rebase 后为 2973a17；分支 tracker 提交 e5c01a4 rebase 时自动去重——"patch contents already upstream"，v1.4 同路径先例应验）。
  - **验收口径**：操作者 2026-09-11 于 wt-55 dev 目检后明示「55 工单已验收」；脚本门禁 typecheck 绿 + vitest **1113/1113（81 文件）**。
  - **冲突处置**：零冲突。rebase 干净（fa6404d 与 main 簿记提交零交叠）、ort 合并干净。合并前簿记三连：1.5 tracker 基线入库 5b8218e（spec/intake/波次表/12 票 + 门禁脚本 picode-1-5 路径，操作者 2026-09-10 授权）、规划期对比帧 2af3f8f（pi15-*.png ×11）、本票终态 sync 44ac1d3——交接项全部闭环。
  - **wt-55 未跟踪草稿甄别**：11 个规划期草稿，8 个与 main 逐字节一致、3 个（spec/波次表/54 票）为追加链（63–65）前的严格旧稿（54 票还是 Status: claimed 建票稿）——零独有内容，git clean 清除后脚本放行。
  - **终态审计**：CONTEXT.md 词条（L129 含 ZCode 偏离双记录）、ChatView/FollowView `turn.hasContainer`、TurnContainer `expandable = turn.hasWork`（Q12=A 注释在位）、turn-collapse.ts hasContainer 投影、smoke ticket-55 段、`visual:worked` 脚本、wc1–wc3 帧——全部在 main 幸存；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删。**解锁**：56（回合时间序，W2）——ChatView 基座已更新，t54 rebase 时对撞面预判见主报。
