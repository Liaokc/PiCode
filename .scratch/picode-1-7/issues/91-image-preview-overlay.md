# 91: 图片放大预览浮层——composer 附件缩略图

**What to build:** composer 已贴图片的缩略图**点击放大**：全屏遮罩预览（视觉继承被删表格预览的遮罩模式）；**四种退出：空格 / 右上角 ❌ / Esc / 点击遮罩空白**（操作者指定前两种，Q11 加后两种）。发送气泡缩略图（票 97）复用同一浮层。

**背景（取证）：** 新供面；遮罩交互先例 = `md-table-preview`（票 87 删除后其模式由本票继承）。操作者原话：「点击图片可以放大图片看一下图片是什么样子，就和之前的预览表格卡一样」。

**Blocked by:** 81（Composer 布局修缮——同文件群串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] 点击附件缩略图 → 全屏遮罩预览（大图清晰、过采样缩放不糊）
- [ ] 四种退出全部可用（electron smoke 逐一断言：Space / ❌ / Esc / 遮罩点击）
- [ ] 多图时可前后翻看（←/→，票内裁量；不强制）
- [ ] 预览打开期间 composer 状态（草稿/附件）零扰动；关闭后焦点回 composer
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；visual 预览帧
