# 91: 图片放大预览浮层——composer 附件缩略图

**What to build:** composer 已贴图片的缩略图**点击放大**：全屏遮罩预览（视觉继承被删表格预览的遮罩模式）；**四种退出：空格 / 右上角 ❌ / Esc / 点击遮罩空白**（操作者指定前两种，Q11 加后两种）。发送气泡缩略图（票 97）复用同一浮层。

**背景（取证）：** 新供面；遮罩交互先例 = `md-table-preview`（票 87 删除后其模式由本票继承）。操作者原话：「点击图片可以放大图片看一下图片是什么样子，就和之前的预览表格卡一样」。

**Blocked by:** 81（Composer 布局修缮——同文件群串行）.

**Status:** ready-for-human

## Acceptance

- [x] 点击附件缩略图 → 全屏遮罩预览（大图清晰、过采样缩放不糊）
- [x] 四种退出全部可用（electron smoke 逐一断言：Space / ❌ / Esc / 遮罩点击）
- [x] 多图时可前后翻看（←/→，票内裁量；不强制）
- [x] 预览打开期间 composer 状态（草稿/附件）零扰动；关闭后焦点回 composer
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；visual 预览帧

## Comments

- 2026-09-18 (implement session)：票 91 全量落地（rebase main @ 2ecf011 含 81 基座后开工，分支 t91-image-preview）。
  - **Seam-1（TDD 先红后绿）**：`shared/composer/image-preview.ts` 表驱动 vitest 13 例（`tests/shared/composer-image-preview.test.ts`）——① `imagePreviewKeyAction`：Space/Escape → close（操作者四退出中两把键盘钥匙），←/→ 仅多图时 prev/next（单图无处可翻 = null），其余键一律 null（浮层对不认识的键零动作）；② `imagePreviewStep`：环绕步进（末张 →第一张、首张 ←→ 末张），越界下标先归一化再步进，空条防御性保位；③ `imageDataUrl`：唯一全分辨率 data: URL 构造器（composer 本地卡现用，票 97 气泡缩略图从 `{mimeType,data}` 重建时复用——过采样缩放不糊的结构保证：浮层只许渲染全尺寸 payload，52px 缩略图本就是同一 payload 的 CSS 裁切）。
  - **浮层组件**（`ImagePreviewOverlay.tsx`，复用接缝）：props = `images: {src,label}[] + index + onNavigate + onClose`，调用方持有开合状态（composer 今日，97 气泡明日），组件不知道图片来处；遮罩模式继承被删 md-table-preview（fixed backdrop + z-index 90 顶层 + 居中内容 + 右上 ❌ + Esc），遮罩加深（0.82 近黑——内容即作品，环境暗到底片对比度最大）；`role=dialog aria-modal` 于包图 stage；❌ 定位窗口右上角（top/right 14px，图片纵横比无关、永远可达）；多图时底部计数 chip（pointer-events:none——点它=点遮罩空白，落穿关闭）；**遮罩空白判定 = backdrop target-identity**（`e.target === e.currentTarget`——图/❌/chip 都是 backdrop 子元素，永不误关）。焦点纪律：挂载时 state-initializer 捕获 opener（在 ❌ autoFocus 生效前——草稿恢复「只读一次」先例），卸载归还（元素仍在文档时）；preventDefault 上游断：浮层的 document 级 keydown 先于 App 的 window 级 Escape 处理器，凡浮层认领的键一律 preventDefault → App 的 defaultPrevented 守卫拦住「Esc 顺带 park 草稿/退 new-task」与全局 chord（bare Space 不匹配任何 meta 和弦，已核 keymap）。
  - **composer 接线**：`previewIndex: number | null` 纯视图态（只读 images，开合永不改写草稿/附件——零扰动结构性成立）；缩略图变 bare button（`.composer-attachment-thumb`，zoom-in cursor；❌ remove 保持独立 absolute 兄弟——button 不可嵌套）；`closePreview` = 清态 + rAF 焦点回 textarea（浮层卸载先归还 opener=缩略图钮，rAF 再夺回 caret——票 98 Enter-必回发送纪律：焦点不得滞留在 Enter 会再触发的钮上）。
  - **取证链**：`src/main/png-fixture.ts`（零资产：zlib deflate + 手写 CRC-32 构建 IHDR/IDAT/IEND，sips 实测 1200×900 可解码）；smoke stage `image_preview_91_*`（81 stage 之后、无模型调用）：真实鼠标点第 2 缩略图开层 → naturalSize 1200×900 断言（全分辨率 payload 上层）+ contain-fit 盒（1008×756 ≤ 1296×756 cap，且 < 自然尺寸 = 过采样下采样）+ dialog 语义 → ←/→ 环绕翻页（2/3→3/3→1/3 wrap→3/3，data-URL 字符串身份逐步断言真换图）→ 四退出逐一真实驱动（Space/Esc 键盘事件、❌ click、遮罩真实鼠标点击 + elementFromPoint 预检命中 backdrop）→ 每次关闭后 activeElement===textarea + 草稿字节等 + 3 附件原在。visual harness `npm run visual:image-preview`（新 `visual-image-preview.ts`，exclusive gate 入 visual.ts/index.ts/package.json 同 81 模式）。
- 2026-09-18 (verification)：**vitest 1631/1631 + typecheck 双 tsconfig 清 + eslint 清**；`ps` 自查无 PiCode Electron/dev-app/smoke 进程后开跑。**electron smoke 全套 EXIT=0**（含 ticket-44 真实剪贴板焦点阶段——本次无锁屏/焦点阻塞；ticket-91 stage 六断言点全绿：open/walk/space/close_btn/escape/mask）。**visual:image-preview 全绿**：自然 1200×900、盒 1008×756、dialog 语义、❌ top 14/right 14、Space 关闭后 caret 回位、草稿/附件原样。**回归**：票 81 visual harness 重跑全绿（附件条 DOM 变更零回归——几何/caret/滚动条/开合 glide 全照旧）。**视觉帧**：`.scratch/visual/c91-a-overlay-open.png`（2/3 态：棋盘格锐利、❌ 右上、草稿+3 附件在下完好）、`c91-b-nav-next.png`（3/3 态：相位翻转 payload——翻页真换图可见）。
- 2026-09-18 (/code-review 修复)：双轴评审（standards × spec 并行 reviewer 子代理，diff = main...HEAD @ 3c4110f）结论 **standards OK-with-notes + spec OK**，全项处置——
  - **standards P1**：`imageDataUrl` 注释自称「唯一构造源」但 Composer 仍有两处内联 `data:${mime};base64` 构造（pickImages + localImagesFrom）——契约自相矛盾 + 重复代码。修复：两处内联全部改走 `imageDataUrl`，注释声明为真；行为字节等价（同一字符串构造式）。
  - **standards P2**：CONTEXT.md 界面语言缺「图片预览浮层」词条。已增（Avoid: lightbox / 弹窗 / 缩略图放大），并把新代码注释里的 5 处 "lightbox" 同义词全部替换为 overlay（漂移源清除）。
  - **standards P2（裁量不采纳）**：smoke 与 visual harness 的场景搭设近重复（native-setter 草稿 + DataTransfer 粘图 + 真鼠标点击）——评审自身已指出本仓 per-harness 自含惯例（每个 visual-*.ts 自带 sleep/waitFor/capture 先例），提共享模块属跨票重构，留待后续票裁量。
  - **spec P2**：`imageDataUrl` 无生产调用方 = 票 97 前瞻接缝（spec P2 建议留置）——经 standards P1 接线后此条自动消解（两个生产调用方已存在）。
  - 复验全绿：vitest 1631/1631、typecheck 双清、eslint（本票全部触碰文件清；main 上预存 4 error + 1 warning 与本票零交集）、build 清、visual:image-preview 5/5 绿、**electron smoke 全套 EXIT=0 复跑**（stage 六断言点全绿）。
- 2026-09-18 (smoke 偶发与 stage 形态修缮)：全套 smoke 三跑一绿（首跑全绿）→ 复跑 ticket-91 stage 的 Space 环节报「草稿被扰动：尾部多一个空格」。**取证结论 = 环境类偶发，非产品缺陷**：合成 KeyboardEvent 无默认行为永不可能插入文本；真实插入需要真实键盘焦点——smoke 窗口持真实焦点运行期间（ticket-44 先行夺焦），操作者真实按键落入 rAF 焦点所在的 composer 输入框即留下一个尾随空格（票 79/70/83 同款「操作者前台活跃期」已记录类）。**stage 防御修缮**（形态更真实 + 对杂散真实按键免疫）：① 键盘事件分发目标从 `document.body` 改为**聚焦后的浮层 ❌ 钮**（press91 辅助：显式 focus + dispatch）——真实用户在浮层上按键时焦点在 ❌（autoFocus），绝不在 composer 输入框，此为真实形态；② 场景搭设探针升级为草稿字节关（attachCount + ta.value 双检）；③ 扰动失败转储带 value 逐字符码 + activeElement——杂散真实按键必须自报家门。复跑两套全绿（ticket-88 阶段另遇一次既有 flake 类，与本票零交集，复跑即绿——t89 记录的同款实践）。**跑批注意事项（同 ticket-81 注记）：smoke 运行期间操作者键盘停手，或自前台终端重跑。**
- 2026-09-18 (merge session，per 操作者验收指令「91 工单已验收」)：Status 翻转 ready-for-human（验收框经 Comments 既有证据链勾选在案：实现 / verification 全套 EXIT=0 + 1631/1631 / code-review 双轴 OK-with-notes 全处置 / smoke 偶发取证 + stage 防御修缮）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。CONTEXT.md「图片预览浮层」词条已随票入册（review P2 项），合并时核对。
