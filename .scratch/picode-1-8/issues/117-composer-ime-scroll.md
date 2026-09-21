# 117: composer 光标跟随与 IME 滚动稳定——视觉行定位 + 舞步插桩 + prefill 视口

**What to build:** 四件同根修缮（composer 内部滚动族）：①**`revealComposerCaret` 视觉行定位**——光标行从「硬换行计数（`value.slice(0,selectionStart).split('\n').length-1` × lineHeight）」改为视觉行定位（软换行段落下算出的必须是光标真实所在视觉行；实现形态 dev app 实测后定：selection range 测量 / caret 客户端几何，票内裁量）；②**IME 舞步抖动消除**——中文输入（compositionupdate 每键触发 5 步高度/滚动舞步：height auto → 重测 → 写入 → 恢复 scrollTop → caret reveal）与原生 IME 滚动的竞争插桩实测后修，操作者三场景验收矩阵：拉到底输入中文大幅上移/非中文微微上移（P14）、倒数第二行中文上移/非中文下移（P15）、中下部输入上移到中间（P15 后半）——「拉到最下应该就是最下方，输入不应该改变光标位置」（操作者原话）；③**PREFILL_EVENT prefill 后视口跟随**——queue Edit（票 100）与 edit-resend（票 79）共用的 prefill 路径在置尾+focus 后**视口滚动到光标行**（显示消息末尾文本——现状视口停开头：reveal 硬换行计数误判「已可见」不滚动）；④非中文路径不回退（现状非中文的稳定行为保持）。

**背景（取证）：** `Composer.tsx` 尾部 `revealComposerCaret`——硬换行计数在软换行段落下定位错误；CJK 逐字换行 vs 拉丁按词换行错位幅度不同 = 操作者观察到的中英文差异来源（P13/14/15）。每次输入（含每次 IME compositionupdate——React onChange 对 textarea composition 中间态也触发）跑完整舞步。P21：`App.tsx` queue_entry_edited → PREFILL_EVENT（caret 有置尾）但 textarea 视口不跟随 → 操作者图5 视口停开头。

**Blocked by:** 116（同文件群强串行——typing-commit 分流落地后 reveal 数学在其上修）.

**Status:** ready-for-human

## Acceptance

- [x] **dev app 插桩复现 = 第一验收项**：IME 三场景 × 中英文矩阵实测留档（compositionupdate × 舞步 × 原生滚动竞争证据链）
- [x] Seam-1：视觉行定位纯函数表驱动（junk 测量防御语义不回退——NaN/∞ never moves）
- [x] electron smoke：PREFILL_EVENT 后视口在光标行（长文本 prefill 显示末尾）；中文 IME 场景验收（electron 内合成 composition 或留 dev app 实测记录——票内裁量）
- [x] 非中文路径与收起态既有行为零回退（票 81 R7 语义保持）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P13/P14/P15 + P21 四症同根定稿为 R12。根因 file:line：`revealComposerCaret` 硬换行计数 + 舞步每键触发。中英文差异 = 换行模式错位幅度差（取证推断，插桩实证为票内义务）。

- 2026-09-22 (implement——根因实证与修复)：**插桩复现**（t117-probe.mjs，纯 CDP：`Input.imeSetComposition` 真实合成 + scrollTop 实例 setter 拦截器 + 事件监听）：修复前（t117-prefix5-evidence.json）——英文 A 段 85↔16 振荡（JS 写 16→原生拉回）；CJK A 段每次 compositionupdate JS 写 [恢复 64, 显示 16]+原生回拉=舞步；CJK C 段 ghost 16 持续；en_hard 稳定（回归基准）；P21 prefill 停顶部（scrollTop 0，光标在 394）。**根因确认**：硬换行计数在单段 CJK 草稿算出 ghost 行≈padTop → 每键 reveal 把视口拉回顶部，与原生光标滚动互相拉锯；同值 prefill 下误判「已可见」不滚动。**修复**（三层）：① `expand.ts` 新 Seam-1 纯函数 `composerCaretLineTop`（测量→网格吸附 lineTop；NaN/∞/非正 lineHeight→null 不动；负值钳 line 0），既有 `composerCaretReveal` 不动；② `Composer.tsx` `revealComposerCaret` 重写：无溢出（scrollHeight≤clientHeight）跳过测量（below-cap 零开销），溢出时 `measureCaretLineTopPx`——**textarea 克隆镜像**（cloneNode(false) + absolute/hidden/height:0/**minHeight:0**/transition:none，value=前缀到光标，(scrollHeight−padT−padB)/lh → 行数，caretTop=padT+(lines−1)×lh）——同元素同宽同样式，换行与真实 textarea 逐字一致；③ prefill rAF 置尾+focus 后补 `revealComposerCaret`（P21 ③）。**修复后**（t117-postfix-evidence.json）：矩阵全部 worstUp=0.0、invisible=0（cjk/en/en_hard × 底部/倒数第二/中下九腿全稳）；写入拦截器：CJK 腿 JS 写入全为 restore 同值（reveal 判已可见不写——零振荡），en 腿随内容增长平滑收敛 70→85→87；prefill scrollTop=255（=394+21−160，光标行底对齐视口底）。截图：work-notes/t117-postfix-evidence-composer.png。**镜像技术演进留档**：初版用 div 镜像+零宽 marker（measureCollapsedHeight 先例）；electron smoke 实测（smoke5/6：en/bottom step3 两跑同败，taW=793 下 div 镜像把光标行测低一整行——真实光标行在视野内、reveal 写入被真实 maxScroll 钳回，行为无缺陷但断言误报）后换 textarea 克隆镜像，CDP 验证 10 种文本形状×多宽度克隆行数与真实完全一致（含 min-height:0 修复短前缀被 74px 地板钳位的读数）。

- 2026-09-22 (implement——smoke 阶段与测试)：`src/main/smoke.ts` 新增 t117 stage（t116 后、t81 前，零 model 调用）：leg1 prefill 视口（PREFILL_EVENT 长文本→断言光标行可见+scrollTop>0，settle-poll）；leg2 三场景×三语矩阵（CDP `Input.imeSetComposition` 真实合成 + `Input.insertText`；每步 settle-poll 断言光标行可见且无超一行上行；findOffset117 克隆镜像二分定位目标行；staging 后断言起点可见）；尾清 composer 留给 t81。drive117/prefill 断言用 settle-poll（每 60ms×≤2s）而非固定 140ms 采样——负载下 React commit/原生滚动可晚于固定节拍，单点采样会读到中途态。vitest：composer-expand.test.ts 表驱动新增（junk/吸附/钳位/ghost 行对照/reveal 收敛）51 用例，全套 1996 绿；typecheck 绿。

- 2026-09-22 (跨票 harness 修复披露)：t120 smoke 段场景① 在 base（d0a6be5）起确定性死点：4 个 emitContractEvent 背靠背单发注入 live turn，单趟 growth 222px > scroll-stay 的 STICK_THRESHOLD_PX(160) → 吸底 effect 判「读者已离开」不跟随 → 视口停离底 222px → ①的 AT_BOTTOM 断言必败（两次同 DOM + 干净通道复现；与我 diff 零交集；merge-ticket.sh 只跑 typecheck+单测故未被发玆）。经主管批准修复（测试专用）：4 事件拆为逐事件+settle（每趟 growth<160px，匹配真实流式小步物理），全部断言语义不变；smoke5/6 日志确认 t120 段全绿。同批次另四个零交集段失败留档：t93×1、t75×1（已知争用抖动段）、t44×多次（环境焦点条件，见下）。

- 2026-09-22 (环境事实与验证状态分层)：**已绿证据**：①探针矩阵全绿（t117-postfix-evidence.json，真实 app 上的同断言）；②smoke5/6：t120 修复后 t120/t116 段全绿，t117 prefill 视口腿两跑全绿；③镜像修复（克隆镜像）经 CDP 10 形状×多宽度验证；④单元 1996+typecheck 绿；⑤**t117 阶段 suite 内绿跑（前移位取证，t129 先例）**：镜像修复后的全 smoke 一次运行中，本 stage 临时前移至 t44 之前（复用当前会话 composer，不新建 host，避免破坏 crash-isolation 的 hostPid=最后 binding 配对）——`composer_ime_117_prefill_viewport_ok` + `composer_ime_117_matrix_ok` + `composer_ime_117_done` 全绿（九腿矩阵 × prefill 腿）；跑完已逐字节复原终位（t116 后、t81 前，含 createSession 自包含形态）；该次运行同时验证 t44 剪贴板段 ✓、crash isolation ✓、t20 多会话点状态 ✓，后续死在 t28 段（sidebar 选择跟随视图——本 stage 零会话/零 sidebar 交互，判环境/负载类，留档）。**缺口**：终位形态的全套 smoke 绿跑（届时 t120 修复已合入自然可过）——留 merge 会话/安静窗口补跑。**环境事实**：t44 剪贴板段需真实窗口焦点，macOS 多次拒绝 app.focus({steal})（多次×100 tick 重试失败 + 手动 osascript activate/CDP window.focus 均不获焦，窗口 visible 但 hasFocus=false）——锁屏/操作员活跃类环境条件（阶段注释内已知 t47 类），非代码问题；另 t93/t75 各一次零交集争用抖动留档。

- 2026-09-22 (implemented, self-reviewed)：分支 `t117-ime-scroll` tip `07d2722`（实现提交；票面翻转随其后一小笔提交）。变更：① `shared/composer/expand.ts` 新增 Seam-1 纯函数 `composerCaretLineTop`（测量→网格吸附 lineTop；NaN/∞/非正 lineHeight→null 不动；负值钳 line 0）+ 接口 `ComposerCaretLineMeasure`；既有 `composerCaretReveal` 零改动。② `Composer.tsx` `revealComposerCaret` 重写：无溢出（scrollHeight≤clientHeight）跳过测量；溢出时 `measureCaretLineTopPx`——textarea 克隆镜像（cloneNode(false)+absolute/hidden/height:0/minHeight:0/transition:none，value=前缀到光标，行数=(scrollHeight−padT−padB)/lh）——同元素同宽同样式，换行与真实 textarea 逐字一致；junk（parentNode 缺失/padding NaN/lh≤0）→NaN→不动。③ prefill rAF 置尾+focus 后补 `revealComposerCaret`（P21 ③，queue Edit/编辑重发共用路径）。④ smoke：t117 stage（prefill 视口腿 + 三场景×三语矩阵，CDP 真实输入 + settle-poll 断言）；t120 段场景① 逐事件+settle 修复（测试专用，断言不变）。验证链：typecheck 绿；vitest 1996 绿（含新增 51 用例）；探针 pre/post 对照（worstUp 0.0、invisible 0）；t117 阶段 suite 内绿跑（前移位取证，见上条分层记录）；零回退：R7 语义保持 + en_hard 矩阵腿 + t81/t116 既有 stage。
- 2026-09-22 (self-review)：**Standards 轴**——克隆镜像遵循 measureCollapsedHeight 先例；typing 路径零 setState、零新增渲染；无溢出跳过测量；junk 读数永不移动视图；expand.ts 纯函数+接口导出与同文件风格一致；smoke stage 形态跟随 t116/t81 先例（诊断携带 DOM 数值、debugger try/fail+finally detach）；测试表驱动风格一致；min-height:0 覆盖避免短前缀被 74px 地板钳位。**Spec 轴**——四验收项全落：①插桩复现 pre/post 对照链齐全；②Seam-1 纯函数表驱动+junk 防御；③prefill 视口（smoke 腿+探针双证）；④零回退：R7 语义保持（composerCaretReveal 未动、无溢出跳过=旧 below-cap 行为等价）+en_hard 矩阵腿+t81/t116 既有 stage 回归。
