# t117 progress — composer IME scroll stability

**目标一句话**：票 117——revealComposerCaret 从硬换行计数改视觉行定位（junk 防御不回退）、IME 舞步抖动插桩消除（三场景 × 中英文矩阵=第一验收）、PREFILL_EVENT prefill 后视口滚到光标行（queue Edit 与 edit-resend 共用）、非中文既有行为零回退。

**阶段=开工** 2026-09-24（本地时间待填）

- [开工] worktree t117-ime-scroll，基于 main=d0a6be5（116 已合入）。已读：票面 117、CONTEXT.md、spec R12、ADR 目录清单（0001–0006 有效）。

- [根因分析] Composer.tsx:1022 `revealComposerCaret`：`lineTopPx = padTop + (value.slice(0,selectionStart).split('\n').length-1) × lineHeight` = **硬换行计数**——软换行段落（CJK 每字换行尤甚）下系统性低估光标所在视觉行（单段落文本永远算出第 0 行，lineTop≈padTop），`composerCaretReveal` 见 lineTop < scrollTop 即把视口拽到顶部 = 三场景「上移」来源；英文按词换行低估幅度小 = 「微微上移」。舞步（collapsed typing-commit：height auto→重测→写入→恢复 scrollTop→reveal）每次 input/compositionupdate 都跑，reveal 的错误目标与原生 IME 滚动（浏览器把光标行滚回视野）每键竞争一次 = 抖动。P21：App.tsx:477 queue_entry_edited → PREFILL_EVENT → Composer.tsx prefill 置尾+focus，但 reveal 硬换行计数对长文本算出「已可见」不滚动 → 视口停开头。证据链待插桩实测（下）。关键文件：Composer.tsx（revealComposerCaret:1022、typing-commit 舞步:283-316、prefill:370-389）、shared/composer/expand.ts（composerCaretReveal/composerTypingHeight）、tests/shared/composer-expand.test.ts（Seam-1 表驱动先例）、src/main/smoke.ts（t116 stage:6496、t81 stage:6676 先例）。

- [修复落地] 三处：①`src/shared/composer/expand.ts` 新增 Seam-1 纯函数 `composerCaretLineTop`（测量 caret 行顶→网格吸附的流程坐标 lineTop；NaN/∞/非正 lineHeight→null 不动；负读数钳到 line 0）+ 既有 `composerCaretReveal` 不动；②`Composer.tsx` `revealComposerCaret` 重写：无溢出（scrollHeight≤clientHeight）跳过测量，溢出时 `measureCaretLineTopPx`（镜像 = 全量 computed 样式复制 + 内容宽 + zero-width 行顶 marker，parentNode 缺失/NaN→junk）喂 composerCaretLineTop→composerCaretReveal；prefill rAF 补显式 revealComposerCaret（同值 prefill 边界，P21 ③）；③vitest 表驱动（junk/吸附/钳位/ghost-line 对照/reveal 收敛）51 全绿 + typecheck 绿 + 全套 1996 绿。
- [smoke stage 落地] `src/main/smoke.ts` 新增 t117 stage（t116 stage 后、t81 stage 前）：leg1 prefill 视口（PREFILL_EVENT 长文本 → 断言光标行可见 + scrollTop>0）；leg2 三场景×三语矩阵（CDP Input.imeSetComposition 真实合成 + Input.insertText；每步断言 caretVisible 且无超过一行的上跳；staging 用镜像 offset 探针定位目标行）；尾清 composer。零 model 调用。
- [post-fix 插桩复测] t117-postfix-evidence.json：矩阵全部 worstUp=0.0、invisible=0/7（cjk/en/en_hard × A/B/C 九腿全稳，与 scratch 原生基线一致）；写入拦截器：cjk 腿 JS 写入全为 restore 同值（reveal 判已可见不写——零振荡），en 腿写入随内容增长平滑 70→85→87（reveal 与原生收敛）；prefill scrollTop=255（=394+21−160，光标行底对齐视口底）caretVisible=true。修复前后对照完整：pre-fix ghost 16 写入×原生回写振荡 vs post-fix 收敛。
- [截图证据] t117-postfix-evidence-composer.png（CJK 长草稿底部合成输入后，光标行在视野内；绝对路径 /Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes/t117-postfix-evidence-composer.png）。

- [smoke 尝试1 2026-04-24~04:10] `npm run smoke:electron` 死在 **ticket-93 stage**（「the scrolled-away send never landed the bottom」——transcript send-latch 域，DOM scrollTop=0/scrollH=3934）——在我 t117 stage 之前、与我 diff 零交集（我的改动只碰 composer textarea 内部滚动；t93 断言的是 .chat-scroll 转录滚动）。**竞争证据：wt-129-thinking-memory worktree 的完整 smoke 于 4:07 并发启动（其 electron 进程当时活跃）**——批次已知跨分支资源争用类。等待争用消退后重跑。

- [自评 Standards 轴] Composer.tsx：revealComposerCaret 重写遵循 measureCollapsedHeight 镜像先例（全量 computed 复制 + 同插入点）；无 setState、typing 路径零新增渲染（R12 红线）；无溢出跳过测量（below-cap 零开销）；junk（ parentNode 缺失/padding NaN/隐藏元素 scrollHeight≤clientHeight 提前 return）不回退；selectionEnd 而非 selectionStart（合成中 typing 位置=尾）。expand.ts：纯函数+接口导出风格与同文件一致。smoke.ts：stage 形态完全跟随 t116/t81 先例（withWindow/waitForProbe/fail 诊断携带 DOM 数值；debugger attach try/fail + finally detach）。测试：表驱动风格一致（junk/吸附/钳位/ghost 对照/reveal 收敛）。

- [自评 Spec 轴] ①插桩复现=第一验收项 ✓（pre/post 对照证据链齐全）；②Seam-1 视觉行定位纯函数表驱动+junk 防御不回退 ✓；③electron smoke prefill 视口+IME 场景（stage 已落库待绿）④非中文/收起态零回退：R7 既有语义保持（composerCaretReveal 未动；无溢出跳过=旧路径 below-cap 行为等价）；en_hard 矩阵腿+既有 t81/t116 stage 回归；⑤vitest/typecheck 全绿；dev-app/smoke 前 ps 自查 ✓。

- [smoke 尝试5 05:0x] t120 修复（方案 A）后：t120 段全绿 ✓，t116 段全绿，进入 t117：prefill 视口腿 ✓，但 en/bottom step3 败（scrollTop 28, caretTop 184, lh 21）。
- [smoke 尝试6 05:1x] 同样死在 en/bottom step3，新诊断携带完整几何：taW=793, scrollH=188(8 行), selEnd=885, clientH=160, scrollTop=28, before=28。**根因：div 镜像与真实 textarea 换行在边界宽度差一整行**——smoke 的 taW=793 下 div 镜像把光标行测低一行（测到 184=line 8；真实光标在 line 7=163..184，在视野内）；app 侧 reveal 也用同一 div 镜像测出 184 → 写 45 → 被真实 maxScroll(28) 钳回 28；阶段断言用同一镜像误报。真实行为无缺陷。
- [镜像技术修复] app 的 measureCaretLineTopPx + smoke 阶段三处镜像（SAMPLE_117/place117/findOffset117）全部改为 **textarea 克隆镜像**：cloneNode(false) + position:absolute/visibility:hidden/height:0px/**minHeight:0px**/transition:none，value=前缀，scrollHeight−padT−padB)/lh → 行数 → caretTop=padT+(lines−1)×lh。同元素同宽同样式 → 换行与真实 textarea 逐字一致（div 与 textarea 的换行在边界宽度可差一词甚至一行）。min-height:0 修复短前缀被 74px 地板钳位的读数（offset 0→line 0 ✓）。CDP 验证：10 种文本形状（短/CJK/硬行/混合/尾 \n/长串）×多宽度，克隆行数与真实完全一致；div 镜像在 720-848 宽度下也一致（793 边界仅在 smoke 环境字体渲染下触发）。
- [drive117/prefill settle-poll] 阶段断言从固定 140ms 采样改为 settle-poll（每 60ms 轮询 ≤2s，caretVisible && 无上行超限即过）——负载下 React commit/原生滚动可晚于固定节拍，单点采样会读到中途态。
- [smoke 尝试7-R1 05:29] 死在更早的 t44 段：真实剪贴板点击需窗口获焦，macOS 拒绝 app.focus({steal})，10s×100 tick 重试全败；此前 6 连败 + 手动 osascript activate/CDP window.focus 均不获焦（窗口 visible 但 hasFocus=false）——锁屏/操作员活跃类环境条件（阶段注释内已知 t47 类）。已上报主管，裁决：A 每 ~10 分钟重试（≤1 小时，ps 自查避免与 122/129 撞车）→ 拿到 t117 阶段绿跑即提交；C 超时回落：以现有证据提交 + 票 Comments 分层披露（已绿证据/缺口/环境事实）。

- [交付 06:0x] 前移位取证成功（smokeF2）：t117 阶段 suite 内全绿（prefill_viewport_ok + matrix_ok + done，九腿全过）——复用当前会话 composer 避免新建 host（保 crash-isolation 的 hostPid=最后 binding 配对，该次运行 crash isolation ✓ t44 ✓ t20 点状态 ✓）；后续死在 t28 段（sidebar 选择跟随，零交集留档）。跑完已逐字节复原终位（diff 验证 + typecheck + 51 用例复绿）。提交：实现 `07d2722`（expand.ts/Composer.tsx/smoke.ts/composer-expand.test.ts）+ 翻票 `9ce35c8`（ready-for-human，Comments 含 tip sha、分层证据、跨票 t120 披露、环境事实）。缺口：终位形态全套绿跑留 merge 会话/安静窗口。截图：/Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes/t117-postfix-evidence-composer.png

- [自评 Spec 轴补充] 镜像修复落在票面核心范围（视觉行定位）：R12 验收项的"测量的光标视觉行"由克隆镜像保证与真实 textarea 逐字一致；测试覆盖：单元层 Seam-1 纯函数表驱动（junk/吸附/钳位/ghost 对照/reveal 收敛）+ smoke 阶段 DOM 真值断言（与实现独立的同技术探针）+ CDP 验证（10 形状×多宽度一致性）+ 零回退矩阵（en_hard/R7/t116 既有 stage）。

- [插桩计划] 阶段1（取证）：build + 独立 session 目录 boot 真实 app（--remote-debugging-port），Node 内置 WebSocket 裸 CDP 驱动：机制探针（selection API rect 可用性、镜像测量 vs 已知行）+ 三场景×中英文矩阵（scratch 裸 textarea=纯原生基线 vs React composer=舞步路径，scrollTop 轨迹对比）——pre-fix 证据。阶段2：实现。阶段3：electron smoke t117 stage（CDP imeSetComposition 矩阵 + PREFILL_EVENT 视口断言）+ post-fix 矩阵复测。

- [插桩证据 pre-fix 完成] 探针 = work-notes/t117-probe.mjs（未跟踪），证据 = t117-prefix5-evidence.json + t117-prefix5-evidence-composer.png。真实 app（Electron 44/Chromium，build 后 boot，--remote-debugging-port=9231，CDP Input.imeSetComposition/insertText 真实合成输入，scrollTop 实例 setter 拦截器记录 JS 写入，事件 tap 记录 composition/input/scroll）：
  1. **镜像测量验证精确**：CJK 尾部 caret → 205 = 16+9×21 ✓；中部 → 100 = 16+4×21 ✓；尾换行后 caret → line1 ✓；空行/空值/wrap 边界 ✓。镜像 = 复制全部 computed 样式 + 内容宽度 + zero-width 行顶 marker（inline-block/vertical-align:top/height=lineHeight）。（教训：camelCase 属性名 setProperty 静默无效，必须全量 computed 迭代或 hyphen。）
  2. **selection range 机制否决**：collapsed caret 的 getClientRects()/getBoundingClientRect() 全零（Electron 44 实测）→ 不可用；镜像为主。
  3. **P21 复现**：PREFILL_EVENT 长文本（1718 chars，19 视觉行）→ scrollTop=0、真 caret 行顶 394 不可见、oldMath=16 误判已可见。视口停开头 ✓。
  4. **硬换行英文稳定**（en_hard 三场景 delta 全 0）——现有非中文稳定路径 ✓（零回退基准）。
  5. **舞步×原生滚动竞争实证**（scrollTop 写入拦截器）：每键（含每次 compositionupdate——React onChange 在合成中照样触发舞步）：JS 写入 [restore saved, reveal→**16**]（ghost 行=硬换行计数 line 0）→ 浏览器原生滚动写回 caret 位置（64/85）→ 下一键再 16……EN A：input@70→write 16→scroll@16；下键 input@64（原生已回位）→write 16……采样终态 16（caret 不可见）✓ P14 英文上移。CJK A（底部合成）：restore 64/reveal 16/原生回 64 每键振荡（IME 候选窗跟随 caret 抖动）✓ P14 中文大幅上移。CJK C（中下部）：reveal 16 写入后 caret（line 6）在 [16,176] 内可见 → 原生不再修复 → 视口钉在顶部 = 持续上移 ✓ P15 后半。CJK B：首步原生 +19 下移后随 ghost 振荡 ✓ P15。B/C 的 setup 用镜像行定位（探针 binary search offset→行）。
  6. **原生基线（scratch 裸 textarea，无 React）**：全部场景 scrollTop 恒定不动（70/45 等，零写入）——原生滚动从不无故扰动；app 舞步是唯一扰动源 ✓。
  7. **修复收敛预期**：正确 reveal 目标 = caret 行底 - clientH（A 场景 ≈66）与原生目标（64-66）同点 → 两写入者收敛 → 零振荡；C 场景 reveal 判「已可见」不写 → 视口钉在 45 不动 =「输入不改变光标位置」✓。
