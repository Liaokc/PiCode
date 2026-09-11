# 59: mermaid 图卡——围栏闭合渲染 + 全套操作钮

**What to build:** ```mermaid 围栏**闭合**且解析成功 → 渲染**图卡**（Diagram Card）：小写 mono "mermaid" 标签头 + 右上 sticky 操作钮组（download SVG/PNG/MMD 下拉菜单、copy 源码、fullscreen）+ 渲染体 panZoom；fullscreen 为根层浮层、Esc 退出。**流式未闭合**按普通代码卡显源码（mermaid 需全文才能解析）；**解析失败回退源码卡**（lang=mermaid 标签照常），不弹错误 toast（Q7 拍板）。新增 mermaid npm 依赖，按图型懒加载分片不进主包（ZCode 同型）。

**背景（取证）：** ZCode bundle 实证（streamdown 管线 `data-streamdown:"mermaid-block"`）：头部小写标签 + download（三格式）/copy/fullscreen + panZoom 全默认开；lazy Suspense 按图型分片全家桶。操作者真实用例实锤（01a0801b 会话完整 flow TD 图，PiCode 现只能看源码）。Q6 拍板 C 全家庭——本票是其中 mermaid 部分。

**Blocked by:** None (can start immediately).（需网络装依赖）

**Status:** ready-for-agent

- [ ] 围栏卡型投影纯函数：mermaid 闭合+解析成功 → 图卡 / 流式未闭合 → 源码卡 / 解析失败 → 源码卡回退（表驱动）
- [ ] mermaid 依赖接入：懒加载分片（动态 import），主包零增量；渲染主题用库默认浅色（深色范围外）
- [ ] 图卡 UI：小写 mermaid 标签头 + download（SVG/PNG/MMD）+ copy 源码 + fullscreen（根层浮层、Esc 退）+ panZoom
- [ ] electron smoke：种子会话 mermaid 渲染图卡 + copy 源码 + 坏图回退源码卡
- [ ] visual harness：图卡帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 59`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R4 的 mermaid 部分，Q6=C + Q7 按推荐 + Q11=A）。波次 W1（需网络装依赖）。**60 强串行于本票**（同文件：Markdown 块投影与卡组件）。术语「图卡（Diagram Card）」随票入 CONTEXT.md。1.4 范围外项转正（票 50 仅做了最小标签对齐）。
