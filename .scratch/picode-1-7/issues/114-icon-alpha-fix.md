# 114: 应用图标白边修复——qlmanage 白垫底剥离（alpha 修复步）

**What to build:** 修复应用图标四角白边：Dock/Finder 里图标四角现显示不透明白色三角（操作者截图 截屏2026-09-21 14.02.45）——**期望：四角透明，只保留黑色 squircle 的圆滑弧形角**。修复 = `make-icons.mjs` 光栅化管线加一步**确定性 alpha 修复**：qlmanage 渲染 1024 主图后，对**画布边缘连通的白区做 flood-fill → alpha=0**（纯 Node 实现、无新依赖、不破坏「qlmanage 唯一光栅化器」纪律——只是剥掉它的白垫底）；随后 iconset/icns 全阶梯重新生成。**根因实锤**：qlmanage 渲染 SVG 时把画布透明区垫成不透明白（独立最小用例复现：圆角外像素 = 白色不透明；`build/icon.png` 四角 RGBA 实测 255,255,255,255——SVG 源的四角本是透明的）。π 白笔画与橙块不受影响（不与画布边缘连通，flood-fill 不触及）。

**背景（取证）：** 票 102 交付的 V2 图标（黑 squircle + 白 π + 橙光标）本体形状正确；白边来自光栅化链——qlmanage（QuickLook 缩略图合成）对 SVG 透明区垫白。验证记录：`build/icon.png` 四角像素 (255,255,255,255)；独立 alphatest.svg 复现同型；flood-fill 试修后四角 (0,0,0,0)、π (255,255,255)、背景 (26,26,26) 均完好（intake 会话已用 1024 全图试算 43,992 像素清除、目检通过）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] `make-icons.mjs` 增 alpha 修复步（边缘连通白区 → alpha=0 的 flood-fill，确定性、无新依赖；判定阈值与实现留档）
- [x] 重跑图标阶梯：iconset 全尺寸四角 alpha=0、π/橙块/渐变完好（像素断言入 vitest——app-icon 测试族扩展）
- [x] `build/icon.icns` 重新生成；`npm run package` 产物 Dock 实视无白边（操作者目检 + visual 留档）
- [x] dev 模式窗口/Dock 图标同样无白边
- [x] 票 102 的 visual 留档帧（c102-icon-*）重捕获替换
- [x] vitest / typecheck 全绿；零契约增量；跑打包前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implement session)：修复 = `scripts/icon-alpha.ts`（新模块）+ `make-icons.mjs` 接线，零产品代码、零契约增量。
  - **阈值与实现留档**（实测取证后定案）：填充判据 = `α===255 && min(R,G,B)≥40 && max−min≤24`——squircle 调色板中性 15–38（渐变 #262626→#0f0f0f），min≥40 即白垫污染；色度护栏把品牌橙 #ec7931 等彩色像素排除在反解之外（反解只对中性混合数学成立；实测当前 master 填充区 0 个彩色邻居，护栏是面向未来 SVG 编辑的防御）。清除像素反解：纯白→(0,0,0,0)；过渡带像素 α′=255−min、C′=(C−min)·255/α′（趋黑）——把 qlmanage 垫白的 1px 抗锯齿环还原成 SVG 真实想要的半透明黑缘（白底上与 qlmanage 自身输出重合）。测量实锤：各阈值连通计数 纯白 43,788 / ≥250 43,884 / ≥40 中性 45,278；本实现清除 **45,278** 与测量精确一致（确定性自证；intake 试算指纹 43,992 属试算脚本口径，非定稿实现）。
  - **管线**：qlmanage 1024px 渲染（唯一光栅化器纪律不变）→ decodePng → stripEdgeWhiteMatte（角落 α=0 自检，失败即 throw）→ encodePng 回写 master → sips 阶梯 → iconutil。PNG codec 零依赖（8-bit 非隔行 0/2/4/6 解码、RGBA min-sum 自适应滤波编码，zlib.crc32 需 node≥22.2，被仓内 usage-scan.ts 的 ≥22.18 type-stripping 基线覆盖）；`build/icon.png` 236KB→46KB（编码器差异，产物入库字节全换）。
  - **像素断言入 vitest**（tests/main/app-icon.test.ts，app-icon 族 8→20 例）：接缝 6 例（codec roundtrip 逐字节、填充剥离/内部形状不伤、1px 过渡带反解 (0,0,0,23) 精确、色度护栏、确定性双跑字节一致、dryRun 不突变）+ 资产 6 例（master 四角 (0,0,0,0)、master 无残留边缘连通白（dryRun=0）、π 三笔画/橙块 #ec7931 精确/渐变降序区间、全阶梯 7 尺寸四角 α=0、16px 最难档 π 白 + 橙可辨（实测重采样稀释到 118–136/66–75/33–37 后校准）、icns 解包槽位角 α=0）。sips 重采样实测无暗/白 bleed（master 单点修复即全阶梯成立）。
  - **打包硬验收**：跑前 `ps` 自查净（仅 Orca/ZCode 系统 crashpad helper 与无关 worktree 的 pty 残留 shell，无 dev-app/smoke/端口占用）。`npm run package` 产物 `PiCode.app/Contents/Resources/electron.icns` 与 `build/icon.icns` 字节级一致（cmp）；解包槽位 16/128/512@2x 四角 α=0。真开产物截屏：Dock 实视 4x 放大 `.scratch/visual/c114-icon-dock-live.png`——四角无白边、运行指示点在侧；操作者可对 Dock 常驻态复核（目检项）。
  - **visual 留档**：`.scratch/visual/c114-icon-{1024,256}-on-magenta.png`（品红底合成——四角品红即透明实锤，1024 图弧缘过渡自然无光晕）；`c102-icon-{16,32,64,128,256,1024}.png` 已用修复后阶梯逐尺寸替换（票 102 帧重捕获）。
  - **dev 模式**：dev Dock 图标即 `build/icon.png`（`devDockIconPath` 解析的同一资产，与打包 Dock 同一 1024 位图），随 master 修复自动无白边；接缝测试断言 dev 以精确路径调 setIcon 一次。macOS dev 无逐窗图标表面（票 102 论证），Dock 为唯一可见表面。dev 侧实视截图未在本窗口补截：serialization 自查发现 wt-105-terminal-focus 的 dev app/smoke 正在运行（单实例规矩让位），且本票会话曾因 ps 检查的短路逻辑误启动过本票 dev app（已即时退出纠正，并存时段截屏作废不留档）；dev Dock 终视留待操作者下次 dev 运行目检（与票 102 同口径）。
  - **验证账**：vitest 1868/1868 全绿（含 app-icon 族 20 例）；typecheck 双 tsconfig 清；lint 本票三文件零问题（仓内 13 项全为 main 既有文件遗留基线，未动）。
- 2026-09-21 (code-review，双轴并行子代理)：Standards 0 硬违反 + 3 判断性意见，Spec 无缺失、无越权（反解与零依赖 codec 判为合理细化/达成手段）。采纳修复：① decodePng 内联 Paeth 改复用同文件 `paeth()`（消同文件双写）；② 头注释 node 版本依据改准确（zlib.crc32 需 ≥22.2，原援引的「仓内 ≥22.18 明文基线」无实据，改为陈述 type-stripping 事实同源）；③ dev 侧实视留档缺口如实入账（见上条 serialization 让位）。不采纳 2 项：产线角落自检与测试断言「同形」保留双写（防御与断言本就独立存在，抽 helper 反跨 script/test 边界耦合）；像素偏移惯用法不抽类型（零依赖 Buffer 语境下属惯用，测试侧已用 px() 收敛）。审查笔记：make-icons 角落自检只拦四角、不拦「边缘中段残留」——同谓词 dryRun 复跑必然为 0，无法检测确定性漏清，风险由资产测试 dryRun=0 兑底（审查者亦评风险低）。
