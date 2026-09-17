# 81: Composer 布局修缮——图片遮盖 + 滚动条 + 展开动画

**What to build:** 三件 composer 卡内的布局修缮，端到端可验：①输入框已贴图片时继续打字/换行，**任何新行都不被附件缩略图遮盖**（含触顶 160px 内滚态，caret 始终可见）；②输入内容触顶出现滚动条时，**滚动条完整可见可拖**——展开钮（票 58 操作者批准位不动）不再盖住它；③展开/收起输入框有**丝滑过渡动画**（对齐侧栏/侧板开合的手感；prefers-reduced-motion 直切）。

**背景（取证）：** R7 根因候选锁定 composer 布局群——textarea 高度投影 clamp 74→160px（Composer useEffect [value, expanded]）× attachments 条（`.composer-attachments`）× 160px cap 内滚的叠加；**dev app 复现定位 = 本票第一验收项**（不臆测纪律，操作者截图 pi17-composer-img-cover）。R8 = `.composer-expand` absolute top:6 right:8 z-index:1 盖住 textarea 右缘滚动条上半段（`app.css` 1153 区段），padding-right 44px 只保首行。R10 = 展开/收起高度跳变无过渡。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] dev app 复现脚本先行：还原「多行文字 + 4 图 + 打字换行」现场，定位遮盖机制并留档 ticket comment
- [x] 带图多行输入：cap 内与触顶内滚两态下，任何新行/caret 不被附件条遮盖（electron smoke 断言已入 stage；两态断言另经 visual harness 全绿验证——electron smoke 全跑被 ticket-44 环境焦点阻断，见 Comments）
- [x] 触顶滚动条完整可见可拖，与展开钮无重叠（visual harness 全绿：gutter 10px 常驻 + 真实拖拽 0→90 + 钮命中；electron smoke 断言已入 stage，同上阻断）
- [x] 展开/收起有过渡动画（时长/曲线对齐侧栏侧板），prefers-reduced-motion 直切（visual harness 全绿：展开 16/收起 14 中间帧 + CDP 直切实测 0 中间帧）
- [x] 输入路径零 setState 纪律不破（票 49 先例）；⌘E toggle 行为不回归（状态机与事件路由零改动；既有 composer_expand stage 继续覆盖）
- [x] vitest / typecheck 全绿（1472/1472 + 双 tsconfig 清）；跑 dev app / smoke 前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程（dev-app serialization）
- [x] 全英文 UI 文案（零新增文案）；无契约增量（纯 renderer/visual 层）

## Comments

- 2026-09-17 (implement session，复现定位 = 第一验收项)：dev app 复现脚本先行完成 —— 新增 visual harness `npm run visual:composer-layout`（`src/main/visual-composer-layout.ts`，PICODE_VISUAL_COMPOSER_LAYOUT=1；隔离 store + 回期种子会话，真实侧栏点击进会话，DataTransfer 粘 4 图 + 逐行 input event 打字换行；几何采样 + 截图）。**复现帧**：`.scratch/visual/c81-a-strip-midband.png`（带内态）、`c81-b-cap-scene.png`（触顶态 = 操作者现场）。**机制定位（非臆测，实测几何）**：
  - **R7 遮盖机制 = 自动增高重测量摧毁滚动位置，不是附件条几何重叠**。采样实证：12 行草稿时 box=160px、scrollHeight=272、**scrollTop=0、caret 线 top=247px —— caret 完全在视口折叠之下**；4 附件条与 textarea 矩形相交测试 = false（overlapStrip:false，两态均然）。逐因：`Composer.tsx` 自动增高 layout effect（[value, expanded]）每次输入先 `el.style.height = 'auto'` 重测量 —— auto 态下 textarea 瞬间容下全部内容 → **scrollTop 被钳回 0** → 重钉 160px 后滚动位置已丢；**每个按键视口都跳回草稿顶部**，正在输入的行/caret 永不可见（复现帧里输入框只见前 3 行，第 12 行 caret 不可见，附件条紧贴其下）——操作者读感即「新行被 4 图压住」。
  - **R8 机制实测**：触顶内滚时 gutter = 0（macOS overlay 滚动条不保留槽位）——thumb 画在卡片右缘 = 展开钮（top 6 + 26 = 覆盖首 32px 条带）正下方，上半段被不透明钮面盖住、不可拖。
  - **R10 实测**：展开采样 424,424,424…（0 个中间帧）——高度瞬跳，无过渡。
  - 修复方向照此落地：R7 = 重测量前后快照/恢复 scrollTop + caret 线可见性保证（Seam-1 纯函数）；R8 = 输入框自定义滚动条、track 顶部内缩让开展开钮足迹（钮位不动）；R10 = data-expand-anim 标记只给开合路径挂 height 过渡（--pane-motion-duration ease-out），打字路径零动画，reduced-motion 直切。输入路径保持零 setState。
- 2026-09-17 (implement session，修复完成)：三件修复全绿（visual harness 全部断言过 + vitest 1472/1472 + typecheck 绿）。
  - **R7**：`expand.ts` 新增纯函数 `composerCaretReveal`（caret 线完全可见所需 scrollTop 或 null；NaN/非法几何不移动视图，表驱动 vitest 8 例）。`Composer.tsx` 自动增高 layout effect：重测量前快照 scrollTop → auto 重测 → 重钉 → 恢复 → composerCaretReveal 保证 caret 线入视口。实测触顶态 scrollTop 0→108，caret 线（top 247）完全可见；收起后仍可见。**输入路径零 setState 不破**（全命令式 DOM 写）。
  - **R8**：`.composer-input` 自定义滚动条（10px 槽位、track margin-top 34px —— 展开钮足迹 top 6+26=32px+2px 缓冲，thumb 行程永不进钮区；钮位与形态未动，ticket 58 批准位不动）。实测：gutter 10px 常驻可见、真实鼠标拖 thumb 0→90 滚动、按钮中心命中仍为按钮自身、e1a 文字让位（票 58）不回退。
  - **R10**：`transitionExpand` 对开合提交挂 `data-expand-anim` 标记 → CSS `transition: height var(--pane-motion-duration) ease-out`（对齐侧栏/侧板曲线），`COMPOSER_EXPAND_ANIM_SETTLE_MS=300` 清理（reduced-motion 无 transitionend，timeout 是唯一清理）→ reduced-motion 直切（CDP 模拟实测 0 中间帧）。**关键机制修复**：开合提交的高度测量改在 detached mirror 克隆上进行（活元素上 `auto` 往返在武装过渡下会毒化 before-change style 令收起瞬跳——实测诊断钉死）——开合只有单次高度写入；打字提交走原直接测量路径（零动画、零 setState）。实测展开 16 中间帧 / 收起 14 中间帧（196→229→…→341 / 390→355→…→201）。
  - 修复帧：`.scratch/visual/c81-a-strip-midband.png`（带内态 caret 可见）、`c81-b-cap-scene.png`（触顶态：输入滚到 caret、末行全可见、滚动条 thumb 在展开钮下方可见）、`c81-c-expand-open.png`（原位展开）。
  - **electron smoke**：新增 `ticket 81` stage（composer_layout_81_start…done，四路断言 = band/cap caret、滚动条可见+拖拽+按钮命中、开合 glide、reduced-motion 直切；无模型调用，composer 清场）。⌘E toggle 由既有 composer_expand stage 继续覆盖不回归。**注意**：本机 smoke 在 ticket-44（真实剪贴板）阶段需要窗口真实焦点——macOS 15 后台应用激活被拒，需操作者停手 ~10s 或从前台终端自行 `npm run smoke:electron`；本阶段断言本身未到即被该环境因素阻断，修复代码已过 visual harness 全量断言（同一几何/行为断言集）。
- 2026-09-17 (code-review 阻塞，未执行)：/code-review 两轴子代理三次尝试均止于 spawn 层——workflow 64c1bc68（首跑 agent 名形状错误，已修正为 reviewer）、72c589af、4adf07e0 的子 run 全部报 `async runner did not produce a pid for cwd: …/wt-81-composer-layout`（与 wt-83 会话同日同型 blocker，d5ae592 先例：governed async runner 无法在本会话环境产出子进程 pid；本会话工具 shell 带 `ELECTRON_RUN_AS_NODE=1` 且 PATH 缺 node/npm，疑同源）。按 lane-blocker 规则停止并上报操作者，未做任何非受控回退；实现者已在会话内自行完成两轴自查（spec：R7/R8/R10 全项落地、零范围蔓延、零契约增量；standards：探针脚本在 harness 与 smoke stage 的双份与既有 expand harness/smoke 先例一致、mirror 克隆测量边界已核（detached/unmount/清理定时器均安全）、零 setState 保持），两轴正式 review 待操作者在可用环境补跑或批准替代方式。
- 2026-09-17 (verification，rebase 后 @ 5059394，based on main 1c21575 含 completion-report 规则)：vitest 全套 1472/1472 绿；typecheck 双 tsconfig 清；`visual:composer-layout` harness 全部断言绿（R7 band/cap caret 可见、附件条零重叠、R8 gutter 10px/钮让位/真实拖拽 0→90/钮命中、R10 展开 16 帧/收起 14 中间帧、CDP reduced-motion 直切 0 中间帧）；`visual:expand`（票 49/58）回归全绿（e1a/e1/e2/e2b 四帧断言照常）。**electron smoke**：ticket-81 stage 已入 `smoke.ts`（无模型调用、清场收尾），但全跑五连在 **ticket-44 真实剪贴板阶段**被 macOS 焦点窃取拒绝阻断（`the window never took focus`，操作者前台活跃期间焦点类阶段必挂——票 79/70/83 同款已记录限制；本会话是操作者活跃对话，重试窗口内始终未夺得焦点），本票 stage 断言未及执行。smoke 补跑通路：操作者停手 ~15s 或自前台终端 `npm run build && npm run smoke:electron`（断言集与 visual harness 同构，代码路径已全量验证）。**操作者：`bash scripts/merge-ticket.sh 81`。**
