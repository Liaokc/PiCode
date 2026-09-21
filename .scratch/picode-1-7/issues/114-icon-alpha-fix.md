# 114: 应用图标白边修复——qlmanage 白垫底剥离（alpha 修复步）

**What to build:** 修复应用图标四角白边：Dock/Finder 里图标四角现显示不透明白色三角（操作者截图 截屏2026-09-21 14.02.45）——**期望：四角透明，只保留黑色 squircle 的圆滑弧形角**。修复 = `make-icons.mjs` 光栅化管线加一步**确定性 alpha 修复**：qlmanage 渲染 1024 主图后，对**画布边缘连通的白区做 flood-fill → alpha=0**（纯 Node 实现、无新依赖、不破坏「qlmanage 唯一光栅化器」纪律——只是剥掉它的白垫底）；随后 iconset/icns 全阶梯重新生成。**根因实锤**：qlmanage 渲染 SVG 时把画布透明区垫成不透明白（独立最小用例复现：圆角外像素 = 白色不透明；`build/icon.png` 四角 RGBA 实测 255,255,255,255——SVG 源的四角本是透明的）。π 白笔画与橙块不受影响（不与画布边缘连通，flood-fill 不触及）。

**背景（取证）：** 票 102 交付的 V2 图标（黑 squircle + 白 π + 橙光标）本体形状正确；白边来自光栅化链——qlmanage（QuickLook 缩略图合成）对 SVG 透明区垫白。验证记录：`build/icon.png` 四角像素 (255,255,255,255)；独立 alphatest.svg 复现同型；flood-fill 试修后四角 (0,0,0,0)、π (255,255,255)、背景 (26,26,26) 均完好（intake 会话已用 1024 全图试算 43,992 像素清除、目检通过）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] `make-icons.mjs` 增 alpha 修复步（边缘连通白区 → alpha=0 的 flood-fill，确定性、无新依赖；判定阈值与实现留档）
- [ ] 重跑图标阶梯：iconset 全尺寸四角 alpha=0、π/橙块/渐变完好（像素断言入 vitest——app-icon 测试族扩展）
- [ ] `build/icon.icns` 重新生成；`npm run package` 产物 Dock 实视无白边（操作者目检 + visual 留档）
- [ ] dev 模式窗口/Dock 图标同样无白边
- [ ] 票 102 的 visual 留档帧（c102-icon-*）重捕获替换
- [ ] vitest / typecheck 全绿；零契约增量；跑打包前 `ps` 自查（dev-app serialization）
