# 102: 应用图标接入——V2 定稿上屏

**What to build:** PiCode 正式应用图标（Q22 选型 **V2**：黑 squircle 微渐变 #262626→#0f0f0f + 白几何斜体 π + 品牌橙 #ec7931 终端光标块——定稿参照 `.scratch/picode-1-7/icon-proposals/v2-pi-cursor.svg`）：①SVG master 正式化进仓库资产目录（自绘几何路径、无字体依赖）；②生成 icns/png 全尺寸；③接入打包链（打包脚本的 icon 选项——现打包产物是 Electron 默认图标）；④dev 模式窗口/Dock 图标。ZCode 图标仅作过形制校准参照（黑 squircle + 白粗斜体 Z 同族形），**其资产不入库**（红线）；π 字形为自绘，无复制。

**背景（取证）：** 全仓无任何自定义图标（无 icns/icon 资产、`scripts/package.mjs` 无 icon 选项——打包走 @electron/packager 默认）；四案设计过程与定稿理由见 `../intake-grilling.md` R20 节与 `../icon-proposals/index.html`。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] 仓库资产目录含 SVG master + 生成的 icns/png（1024/512/256/128/64/32/16 全尺寸）
- [ ] `npm run package` 产物 PiCode.app 图标 = V2（Finder/Dock 实视）；`package:verify` 通过
- [ ] dev 模式（electron-vite dev）窗口与 Dock 图标 = V2
- [ ] 各尺寸视觉自检（16px 光标块可辨、squircle 边缘无锯齿）——visual 留档
- [ ] 跑打包前 `ps` 自查（dev-app serialization——package:verify 会真开应用）
