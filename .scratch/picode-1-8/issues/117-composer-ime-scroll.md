# 117: composer 光标跟随与 IME 滚动稳定——视觉行定位 + 舞步插桩 + prefill 视口

**What to build:** 四件同根修缮（composer 内部滚动族）：①**`revealComposerCaret` 视觉行定位**——光标行从「硬换行计数（`value.slice(0,selectionStart).split('\n').length-1` × lineHeight）」改为视觉行定位（软换行段落下算出的必须是光标真实所在视觉行；实现形态 dev app 实测后定：selection range 测量 / caret 客户端几何，票内裁量）；②**IME 舞步抖动消除**——中文输入（compositionupdate 每键触发 5 步高度/滚动舞步：height auto → 重测 → 写入 → 恢复 scrollTop → caret reveal）与原生 IME 滚动的竞争插桩实测后修，操作者三场景验收矩阵：拉到底输入中文大幅上移/非中文微微上移（P14）、倒数第二行中文上移/非中文下移（P15）、中下部输入上移到中间（P15 后半）——「拉到最下应该就是最下方，输入不应该改变光标位置」（操作者原话）；③**PREFILL_EVENT prefill 后视口跟随**——queue Edit（票 100）与 edit-resend（票 79）共用的 prefill 路径在置尾+focus 后**视口滚动到光标行**（显示消息末尾文本——现状视口停开头：reveal 硬换行计数误判「已可见」不滚动）；④非中文路径不回退（现状非中文的稳定行为保持）。

**背景（取证）：** `Composer.tsx` 尾部 `revealComposerCaret`——硬换行计数在软换行段落下定位错误；CJK 逐字换行 vs 拉丁按词换行错位幅度不同 = 操作者观察到的中英文差异来源（P13/14/15）。每次输入（含每次 IME compositionupdate——React onChange 对 textarea composition 中间态也触发）跑完整舞步。P21：`App.tsx` queue_entry_edited → PREFILL_EVENT（caret 有置尾）但 textarea 视口不跟随 → 操作者图5 视口停开头。

**Blocked by:** 116（同文件群强串行——typing-commit 分流落地后 reveal 数学在其上修）.

**Status:** ready-for-agent

## Acceptance

- [ ] **dev app 插桩复现 = 第一验收项**：IME 三场景 × 中英文矩阵实测留档（compositionupdate × 舞步 × 原生滚动竞争证据链）
- [ ] Seam-1：视觉行定位纯函数表驱动（junk 测量防御语义不回退——NaN/∞ never moves）
- [ ] electron smoke：PREFILL_EVENT 后视口在光标行（长文本 prefill 显示末尾）；中文 IME 场景验收（electron 内合成 composition 或留 dev app 实测记录——票内裁量）
- [ ] 非中文路径与收起态既有行为零回退（票 81 R7 语义保持）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P13/P14/P15 + P21 四症同根定稿为 R12。根因 file:line：`revealComposerCaret` 硬换行计数 + 舞步每键触发。中英文差异 = 换行模式错位幅度差（取证推断，插桩实证为票内义务）。
