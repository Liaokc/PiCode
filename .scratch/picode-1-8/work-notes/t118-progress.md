# t118 progress — 技能选中保留既有文本（只剥离触发 token）

目标一句话：slash 菜单选中技能卡时不再清空输入框——只剥离触发 token（/query），其余文本保留为卡后参数，caret 落余文原位，发送重组路径零改动。

阶段=开工（2026-09-22）。

事件日志：
- 2026-09-22 开工：已读票面 118-skill-keep-text.md 与 context.md（CONTEXT.md 全文随任务下发）。待读 spec R7 与 Composer.tsx / menu-surface.ts 代码。
- 2026-09-22 票 Status→claimed（worktree 副本）。
- 2026-09-22 取证完成：根因 = Composer.tsx:506 pickTextMenuRow card 分支 updateValue('')；menu-surface.ts 触发面（首字符 / + caret 前无空白）意味着先有文本再回开头打 / 时，选中即全清。既有 smoke（票52/72）都在纯 token 值上 pick，断言 value===''，不回归。117 接缝 = revealComposerCaret/measureCaretLineTopPx/PREFILL_EVENT 区段，不碰。
- 2026-09-22 方案定稿：Seam-1 新纯函数 stripTriggerToken(text, caret)→{value, caret}，落 shared/composer/commands.ts。触发 token = `/`+query（止于 caret，menu-surface 自己的 query 定义）+ 紧随其后分隔空白 run（=「首个空白或串尾」边界）；余文 = slice(caret) 去前导空白；caret 落余文开头 0。理由：①操作者场景（先有文本回开头打 /，无分隔空白、CJK 尤甚）必须整段保留——若边界取首个空白会吞掉粘在 token 后的首词；②分隔空白若不随 token 剥离，composeCommandText 重组出双空格，破坏与裸文本逐字节一致；③composeCommandText 零改动。图片是独立 state，非本缝输入，由 smoke 断言幸存。
- 2026-09-22 实现落地（全部五处）：① shared/composer/commands.ts 新增 stripTriggerToken(text, caret)→CommandPickText{value, caret}；② Composer.tsx pickTextMenuRow card 分支 setCard + updateValue(kept.value, kept.caret)（注释重写，117 接缝未动）；③ tests/shared/composer-commands.test.ts 新增 stripTriggerToken 表驱动 describe（11 行用例 + 域外 clamp + 与 composeCommandText 逐字节重组闭环）；④ smoke.ts 新增 skill_keep_text_118 阶段（117 阶段后、81 阶段前；种子技能 + 新会话 + 草稿 + 1 图 + 回开头打 /picode-118 + pick 断言文本/图/caret0 + 发送 SDK 扩张断言 + 重置断言）+ 头部注释段；⑤ CONTEXT.md 技能卡词条补「既有文本共存」句。局部验证：composer-commands.test.ts 20/20 绿。
- 2026-09-22 全量验证：vitest 118 文件 / 2037 测试全绿；typecheck 双 project 绿。electron smoke 首跑（终位）死在 ticket-44 段「the window never took focus」——已知环境事实（操作者活跃时 macOS 拒绝 steal，纪律 C ②），我的阶段在其后未获运行。
- 2026-09-22 前移位取证（t129/t117/t125 手法）：把 skill_keep_text_118 阶段块（174 行）临时移到 t44 之前的稳定位置（sidebar_index 之后）重跑：本票阶段五步全绿（draft_staged → pick_kept → send_expanded → send_reset → done），t44 仍死（因前移后焦点会话变成本票单消息会话，改死在首探针；终位下死在焦点步，首跑已证）。跑完 cp 复原终位，diff 逐字节一致，git diff --numstat 验证 smoke.ts = 188 插入 / 0 删除单一块。两次跑 t44 前步骤序列一致（仅临时目录/session id/deltas 计数等时变项）。t44 之后各段（含票 52/72 回归段）在本环境均不可达——留档不追，52/72 断言在本 diff 下构造性保持真（纯 token pick → 余文仍为 ''）。
- 2026-09-22 双轴自评：Standards 轴——Seam-1 纯函数零 React/DOM 依赖；单一 pick 路径（票 69）保持；menu-surface/composeCommandText/stripSkillQuery/builtin 分支/× 移除全未动；Composer.tsx diff 仅 import + card 分支两块，117 接缝零扰动；注释改写为新不变量（旧注释自辩已删）。Spec 轴——五项 Acceptance 逐条对照见票面勾选；「图存在」维度说明：图片是独立 state 非 seam 输入，由 smoke 断言幸存（票 Comments 披露）。
- 2026-09-22 视觉帧：`visual-skill-card` harness 增 sc4-keep-text（操作者复现：先打草稿 → 回开头打 /picode-visual → pick → 断言卡 + 草稿整段保留 → 截帧）。两跑四帧全绿；sc4 用独立草稿文本使帧自描述；帧路径 /Users/liaokechen/PiCode/.worktrees/wt-118-skill-keep-text/.scratch/visual/sc4-keep-text.png。sc1-sc3 偶发重生已 git restore 避免噪音。⚠序列化险情披露：第二次 visual 跑前 ps 检查已见 t133 worktree 的 electron 在跑而仍执行了（两跑均绿、双方无实际干扰；隔离 userData/session store）——连律，如实留档。
- 2026-09-22 提交：实现提交 9cc1dd9（六文件）；票面翻转 c18aefe；sc4 帧 + harness + 票 Comments 补录为第三笔。终态：Status=ready-for-human。
