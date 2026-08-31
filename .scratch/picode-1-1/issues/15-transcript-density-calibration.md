# 15: 转录排版密度校准——行距回归

**What to build:** 聊天转录区的排版密度回到 ZCode 基准：修复 markdown 块间距异常（列表项间距约为基准 2 倍），并对字号/行高/段落间距做一次系统校准。范围限**聊天主区**（`.md` 与消息节奏）；侧栏/设置/预览仅走查记录、不重排。

**背景（证据）：**
- 对照：ZCode 落定态基准（`.scratch/reference/screenshots/截屏2026-08-27 18.54.27.png`）vs PiCode 实拍（`.scratch/visual/2-settled.png`）：单行列表项间隔 ~56px vs ~24–28px，段落间隙同样偏大。
- 高嫌疑根因（实现时先确认）：`app.css` `.msg { white-space: pre-wrap }` 被 `.md` 继承且未重置——react-markdown 块级元素间的换行文本节点被当作真实换行渲染，相当于块间多出空行；`.md li { margin: 3px 0 }` 本身不宽。
- 定性：ticket 12 视觉终审口径为结构解剖（构图/组件形态），未做密度度量，属**终审漏检回归**，非新需求。
- 密度权威：操作者已授权打开 ZCode 实机取证（悬停态按钮等截图基准同此口径）。

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] 实现前先落最小复现：固定 markdown 样本（列表/段落/代码块/引用）在 dev 转录区截图归档 `.scratch/visual/`，标出异常间距数据
- [ ] 修复后同一样本与 ZCode 实机同内容并排对照：列表项与段落间距目测一致，字号与行高一并核对
- [ ] 密度校准零信息结构变化：思考行/工具卡/审批药丸/队列面板无回归（`npm run visual:transcript` 全套重拍，DOM 签名断言通过）
- [ ] `.md` 内 `white-space` 语义显式化（正文 normal、代码块保持 pre），附注释防回归
- [ ] typecheck / lint / test 全绿；视觉捕获遵守 dev-app 串行规则

## Comments

- 2026-08-31 (requirements intake): 建票。痛点 3（"行间距过宽"）的代码与截图证据如上；根因为假设、验收第一步即证伪/证实。
- 2026-08-31 (实机比对补充): 打开打包版 PiCode 与 ZCode 实机复核——PiCode 落定态转录（`.scratch/compare/picode-w.png`）单行 bullet 间隔 ~54px、表格 padding 偏大；ZCode live 同屏（`.scratch/compare/z-hover-msg.png`）思考行/工具行/编辑行/文本段全部 ~24px 节奏，同屏信息量约为 PiCode 的 1.8–2 倍。密度回归实锤，验收对照样本可直接采用这两张图。
