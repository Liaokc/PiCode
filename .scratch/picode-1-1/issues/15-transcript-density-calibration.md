# 15: 转录排版密度校准——行距回归

**What to build:** 聊天转录区的排版密度回到 ZCode 基准：修复 markdown 块间距异常（列表项间距约为基准 2 倍），并对字号/行高/段落间距做一次系统校准。范围限**聊天主区**（`.md` 与消息节奏）；侧栏/设置/预览仅走查记录、不重排。

**背景（证据）：**
- 对照：ZCode 落定态基准（`.scratch/reference/screenshots/截屏2026-08-27 18.54.27.png`）vs PiCode 实拍（`.scratch/visual/2-settled.png`）：单行列表项间隔 ~56px vs ~24–28px，段落间隙同样偏大。
- 高嫌疑根因（实现时先确认）：`app.css` `.msg { white-space: pre-wrap }` 被 `.md` 继承且未重置——react-markdown 块级元素间的换行文本节点被当作真实换行渲染，相当于块间多出空行；`.md li { margin: 3px 0 }` 本身不宽。
- 定性：ticket 12 视觉终审口径为结构解剖（构图/组件形态），未做密度度量，属**终审漏检回归**，非新需求。
- 密度权威：操作者已授权打开 ZCode 实机取证（悬停态按钮等截图基准同此口径）。

**Blocked by:** None.

**Status:** resolved

- [ ] 实现前先落最小复现：固定 markdown 样本（列表/段落/代码块/引用）在 dev 转录区截图归档 `.scratch/visual/`，标出异常间距数据
- [ ] 修复后同一样本与 ZCode 实机同内容并排对照：列表项与段落间距目测一致，字号与行高一并核对
- [ ] 密度校准零信息结构变化：思考行/工具卡/审批药丸/队列面板无回归（`npm run visual:transcript` 全套重拍，DOM 签名断言通过）
- [ ] `.md` 内 `white-space` 语义显式化（正文 normal、代码块保持 pre），附注释防回归
- [ ] typecheck / lint / test 全绿；视觉捕获遵守 dev-app 串行规则

## Comments

- 2026-08-31 (requirements intake): 建票。痛点 3（"行间距过宽"）的代码与截图证据如上；根因为假设、验收第一步即证伪/证实。
- 2026-08-31 (实机比对补充): 打开打包版 PiCode 与 ZCode 实机复核——PiCode 落定态转录（`.scratch/compare/picode-w.png`）单行 bullet 间隔 ~54px、表格 padding 偏大；ZCode live 同屏（`.scratch/compare/z-hover-msg.png`）思考行/工具行/编辑行/文本段全部 ~24px 节奏，同屏信息量约为 PiCode 的 1.8–2 倍。密度回归实锤，验收对照样本可直接采用这两张图。
- 2026-09-01 (implement, t15): **已修复，分支 `t15-density-calibration`，提交 `3fc1499`。**
  - **根因证实（非假设）**：`remark-rehype` 在块级元素之间输出真实 `\n` 文本节点（hast 树实证）；`.msg { white-space: pre-wrap }` 被 `.md` 继承，每个块间换行渲染成一个空行。修复前 DOM 实测：单行 bullet pitch **52.1px**、块间隙 **35.1px**（= 23.1px 空行 + 12px margin）、`.md` computed `pre-wrap`——与 52px 实拍吻合。
  - **修复**：`.md { white-space: normal }`（附防回归注释），`.md pre` 显式 `white-space: pre`；`.msg` line-height 1.65→1.75（ZCode 14px 正文 ~25px 行距）；块间距 12→16px（段落 pitch 40.5 vs ZCode ~40）。密度 token 全部**限定 `.msg-assistant .md`**——预览读器共用 `.md`，按范围要求零重排（像素级 diff 证实）。
  - **修复后实测**：bullet pitch **27.5px**（ZCode 24–28）、块间隙 16px、行距 24.5px、段落 pitch 40.5px；代码块保持 `pre`。
  - **复现与归档**（`.scratch/visual/`）：`d0-density-before.{png,json}`（修复前）、`d1-density-after.{png,json}`+`-bottom`（修复后）、`d2-density-before-after.png`（对照图）、`d-density-sample.md`（固定样本，供 ZCode 粘贴同内容）。新增 `npm run visual:density`（PICODE_VISUAL_DENSITY=1，注入固定样本 + DOM 几何测量 dump）。
  - **零信息结构变化**：`visual:transcript` 全套 13 张重拍，DOM 签名探针全过；思考行/工具卡/审批药丸/队列面板零改动；预览面板像素级一致；侧栏/设置走查（s1–s4）差异仅为会话列表内容与 cwd 芯片（环境性）。
  - **范围偏差记录**：intake 所记"表格 padding 偏大"与归档 ZCode 基准矛盾（ZCode 表行 pitch 33–41px vs PiCode 33px），**不予采纳**，表格容器化归 ticket 16。
  - typecheck / lint / vitest（458）全绿；code-review（Standards+Spec 双轴）通过，发现均已处置。
  - **待操作者人工关卡**：将 `d-density-sample.md` 粘入 ZCode 实机同内容渲染，与 `d1-density-after.png` 并排目测（字号/行高/列表/段落节奏）；通过后 `bash scripts/merge-ticket.sh 15`。

- 2026-09-01 (merge session, T00): merged as **7de86df** (`merge: t15-density-calibration`, rebase + no-ff onto main)。验收口径：操作者明确「已验收」（含票内人工关卡：d-density-sample 与 ZCode 同内容并排目测）；实现会话记录 bullet pitch 52.1→27.5px、块间隙 16px、行距 24.5px、段落 pitch 40.5px（ZCode 基准内），visual:transcript 全套重拍 + DOM 签名全过、typecheck/lint/vitest（458）全绿、code-review 双轴通过；合并后 main 上 typecheck + vitest 486/486 全绿。冲突处置：13 张 visual PNG 二进制冲突取本票侧重拍版（最新含密度修正的视觉基线）。
