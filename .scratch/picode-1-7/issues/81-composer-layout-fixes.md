# 81: Composer 布局修缮——图片遮盖 + 滚动条 + 展开动画

**What to build:** 三件 composer 卡内的布局修缮，端到端可验：①输入框已贴图片时继续打字/换行，**任何新行都不被附件缩略图遮盖**（含触顶 160px 内滚态，caret 始终可见）；②输入内容触顶出现滚动条时，**滚动条完整可见可拖**——展开钮（票 58 操作者批准位不动）不再盖住它；③展开/收起输入框有**丝滑过渡动画**（对齐侧栏/侧板开合的手感；prefers-reduced-motion 直切）。

**背景（取证）：** R7 根因候选锁定 composer 布局群——textarea 高度投影 clamp 74→160px（Composer useEffect [value, expanded]）× attachments 条（`.composer-attachments`）× 160px cap 内滚的叠加；**dev app 复现定位 = 本票第一验收项**（不臆测纪律，操作者截图 pi17-composer-img-cover）。R8 = `.composer-expand` absolute top:6 right:8 z-index:1 盖住 textarea 右缘滚动条上半段（`app.css` 1153 区段），padding-right 44px 只保首行。R10 = 展开/收起高度跳变无过渡。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] dev app 复现脚本先行：还原「多行文字 + 4 图 + 打字换行」现场，定位遮盖机制并留档 ticket comment
- [ ] 带图多行输入：cap 内与触顶内滚两态下，任何新行/caret 不被附件条遮盖（electron smoke 断言）
- [ ] 触顶滚动条完整可见可拖，与展开钮无重叠（electron smoke + 视觉）
- [ ] 展开/收起有过渡动画（时长/曲线对齐侧栏侧板），prefers-reduced-motion 直切
- [ ] 输入路径零 setState 纪律不破（票 49 先例）；⌘E toggle 行为不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查无其他 PiCode Electron/dev-app/smoke 进程（dev-app serialization）
- [ ] 全英文 UI 文案；无契约增量
