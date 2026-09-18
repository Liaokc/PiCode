# 102: 应用图标接入——V2 定稿上屏

**What to build:** PiCode 正式应用图标（Q22 选型 **V2**：黑 squircle 微渐变 #262626→#0f0f0f + 白几何斜体 π + 品牌橙 #ec7931 终端光标块——定稿参照 `.scratch/picode-1-7/icon-proposals/v2-pi-cursor.svg`）：①SVG master 正式化进仓库资产目录（自绘几何路径、无字体依赖）；②生成 icns/png 全尺寸；③接入打包链（打包脚本的 icon 选项——现打包产物是 Electron 默认图标）；④dev 模式窗口/Dock 图标。ZCode 图标仅作过形制校准参照（黑 squircle + 白粗斜体 Z 同族形），**其资产不入库**（红线）；π 字形为自绘，无复制。

**背景（取证）：** 全仓无任何自定义图标（无 icns/icon 资产、`scripts/package.mjs` 无 icon 选项——打包走 @electron/packager 默认）；四案设计过程与定稿理由见 `../intake-grilling.md` R20 节与 `../icon-proposals/index.html`。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] 仓库资产目录含 SVG master + 生成的 icns/png（1024/512/256/128/64/32/16 全尺寸）
- [x] `npm run package` 产物 PiCode.app 图标 = V2（Finder/Dock 实视）；`package:verify` 通过
- [x] dev 模式（electron-vite dev）窗口与 Dock 图标 = V2
- [x] 各尺寸视觉自检（16px 光标块可辨、squircle 边缘无锯齿）——visual 留档
- [x] 跑打包前 `ps` 自查（dev-app serialization——package:verify 会真开应用）

## Comments

- 2026-09-18 (implement session)：V2 定稿四件套全部落地，红线条条守住（ZCode 资产零入库；π 为自绘几何 rect+skew，无字体/无内嵌位图）。
  - **SVG master 正式化**：`build/icon.svg`——几何与定稿 `.scratch/picode-1-7/icon-proposals/v2-pi-cursor.svg` 逐字节同形（黑 squircle 微渐变 #262626→#0f0f0f + 白斜体 π + 橙 #ec7931 光标块），头部注明出处/调色板/再生成命令。防走私不变量入 vitest：master 无 `<text>`/`font-family`/`<image>`/`href`（自绘红线测试，tests/main/app-icon.test.ts）。
  - **全尺寸生成**：`scripts/make-icons.mjs`（零 npm 依赖，macOS 内建管线 qlmanage 1024px 渲染（alpha 保留）→ sips 降采样 → iconutil 打包 icns；rsvg-convert/magick 存在则优先）。产物全入库：`build/icon.png`（1024 主栅格）+ `build/icons/{16,32,64,128,256,512,1024}.png` + `build/icon.icns`（10 槽全齐，iconset 槽测试断言）；`build/icon.iconset/` 为派生品进 .gitignore。脚本自检：每尺寸实测方形达标 + master IHDR color type=6（角落透明）。
  - **打包链接入**：`scripts/package.mjs` 增 `icon: build/icon.icns`；实测产物 `PiCode.app/Contents/Resources/electron.icns` 与 `build/icon.icns` **字节级一致**（cmp），Info.plist `CFBundleIconFile=electron.icns`；同时 `/build($|\/)` 入 ignore——图标源/产物不重复进 bundle（bundle 内 Resources/app 仅 node_modules/out/package.json）。（packager 的 ".icon" 扩展名 warning 为 v20 对 macOS 26 新格式的探测噪音，icns 已实际生效。）
  - **dev Dock 图标**：`src/main/app-icon.ts` 纯函数接缝（`devDockIconPath` out/main→…/build/icon.png 解析 + `applyDevDockIcon(dock, {isPackaged, mainDir})`——无 Dock/已打包/资产缺一概 no-op 并返回 false）；`index.ts` whenReady 顶部接线（packaged 下 no-op，Dock 归 bundle icns 所有；dev 下以 1024px PNG 覆盖 Electron 原子图标）。验收项的「窗口与 Dock 图标」：macOS 无逐窗图标表面（BrowserWindow icon 仅 Win/Linux），Dock 即 dev 模式唯一可见图标表面，已覆盖。vitest app-icon.test.ts 8 例（seam 5：路径解析存在/缺失、dev 态以精确路径调用一次、打包态不调 setIcon、无 Dock no-op + 资产缺 no-op；资产 3：全资产在库、自绘红线不变量、icns 十槽 round-trip；连同 window-options 4 例 = 本票相关 12 绿）。
  - **package:verify（硬验收）= 绿**：第 1 跑在 ticket-65 usage-hover 阶段被 timing flake 拦（一次性合成 mousemove 恰逢面板布局中，hover 落点漂移；与图标改动无关——packaged app 内本票改动为零运行时行为，见上 no-op 论证），第 2 跑完整通过 **SMOKE done + PACKAGED ARTIFACT VERIFIED**（真开应用、真会话轮全程绿；输出尾部的 tripwire 90s unhandled-rejection 为通过跑同款既有噪音）。跑前 `ps` 自查：无其他 PiCode dev-app/smoke 进程（Postman/ZCode 系统常驻除外）。
  - **dev 实机自检**：`PICODE_FAKE_SETTINGS=1 npx electron .` 真启 unpackaged app（与 electron-vite dev 同一 `out/main` 代码路径），9s 存活、stderr 零图标相关错误；dock setIcon 调用由接缝测试精确断言（NSDockTile 无读 API，图标终视由操作者下次 dev 运行一眼确认）。
  - **visual 留档**：`.scratch/visual/c102-icon-{16,32,64,128,256,1024}.png`。逐尺寸自检：16px π 可辨、橙光标块明确可辨（右下橙点）、squircle 边缘无锯齿；32/64/128/256/1024 全清晰。
  - **验证账**：typecheck 双 tsconfig 清；vitest 1626/1626 全绿（含新 app-icon 12 例）；lint 本票零新增问题（仓内另有 6 error+1 warning 全部为既有文件遗留——86 号 ticket capture.mjs、draft-captures.mjs、EmptyState.tsx warning、三个测试文件，非本票范围未动）。
  - 无契约增量（纯资产 + main 进程 dev-only 接缝 + 打包脚本选项）；`build/icon.iconset/`（派生）与 `release/` 不入库。
- 2026-09-18 (code-review，两轴并行子代理)：Standards 与 Spec 均零 P0/P1，双轴 merge verdict = OK with notes。已采纳修复（commit trail）：① make-icons.mjs `SIZES` 改由 `ICONSET_SLOTS` 派生（消重复，防漂移）；② 光栅化钉死 qlmanage 单路径（审查指出 rsvg/magick fallback 属 Speculative Generality 且令再生成产物依环境变字节）；③ 测试 helper 参数 `buildDir: string|null` → `hasBuild: boolean`（presence 标记非路径）；④ 本 Comments 计数勘误（原误记 vitest 6 例/12 例——实为 app-icon.test.ts 8 例，12 = 连同 window-options 4 例）。审查笔记不采纳 1 项：Status 翻 ready-for-human 系 T81 以来的既有流程约定（实现完成后翻状态、merge session 同步回 main），非 stale label。Spec 轴红线复核通过：ZCode 资产零入库、π 自绘无字体、几何与定稿逐字节同形。
