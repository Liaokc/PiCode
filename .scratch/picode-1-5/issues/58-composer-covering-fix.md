# 58: Composer 遮盖修复——文本区右 padding 预留按钮区

**What to build:** Composer 输入区右侧 padding 从 18px 增至约 44px（预留右上角展开钮区：right 偏移 8 + 宽 26 + 余量），首行文本与光标**永不穿钮下**；折叠态与展开态（280–560px）同规则；展开钮的位置（输入卡右上角，票 49 Q12 操作者拍板）与按钮 chrome 零变化。New Task 与会话内共组件自动同享。

**背景（取证）：** `.composer-input` 右 padding 18px；`.composer-expand` 绝对定位 right:8px 26×26 不透明卡色底（注释自述 "text flowing beneath stays masked"——有意遮盖设计）→ 首行文本与光标从钮下穿过被盖（pi15-composer-icon-covers-text）。修法 = padding 让位（Q5 拍板 A，保位置；被拒：移 footer——推翻票 49 拍板 / 透明底——字钮重叠更糟）。ZCode 无此钮（操作者批准偏离项），无校准参照。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] 输入区右 padding 预留按钮区：折叠态首行文本在按钮左缘前换行、光标全程可见；展开态同规则
- [ ] 按钮位置/top-right 锚定/hover 形态零变化；两处 composer 同享
- [ ] visual harness：文本贴钮帧（长首行）+ 展开态帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 58`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R3，Q5=A）。波次 W1。纯 CSS 级小票（缺陷，票 49 引入）。
- 2026-09-11 (implement, t58 分支): **feat 提交 55aa97c**，全部验收项完成。
  - **CSS 修法**：`.composer-input` 右 padding 18→44px（`16px 44px 4px 18px`——right 偏移 8 + 宽 26 + 余量 10），注释记票 58 依据。`.composer-expand` 规则零字节改动（位置/top-right 锚定/hover chrome 不变——Q12 拍板维持）；展开态同一 textarea 复用同规则；`.composer-input` 为 New Task 与会话内共组件，自动同享。折叠/展开、空态 74px 底线、160px 增长帽均不受影响（smoke 高度断言零依赖 padding）。
  - **契约增量：无**（纯 CSS + visual harness，零 IPC/契约面改动）。
  - **visual harness**：`npm run visual:expand` 扩两帧——`e1a-text-clearance`（折叠态长首行贴钮：自然散文填满至文本边界、在钮左缘前换行）+ `e2b-expand-clearance`（展开态同规则，半区高 + 转录下推不变）。探针全部几何断言（不测 CSS 字节）：文本边界（rect 右缘 − 右 padding）≤ 钮左缘 + 0.5px、按钮 top-right 锚定（card 右缘差 ≤12px / 顶缘差 ≤12px）、首行实织 ≥4 视觉行。e1/e2 随新 padding 重拍。**harness 加固**：实证发现 resume 引导过渡 / 索引刷新可令视图树闪现一轮重挂载（清空 composer 本地草稿）——staging 加稳定性窗口（探针须连续 3 轮保持）+ 重试（重设值 / 重展开），frame 不再可能静默拍错态。
  - **帧取证注**：CLEARANCE_DRAFT 用自然散文而非长 token——`overflow-wrap: break-word` 会把超行 token 整体挪下行（首行留短），散文才复现「首行填满至边界」的缺陷形态；URL 会在连字符/斜杠提前断行，同样不合格。
  - **gate**：typecheck 绿 / eslint 绿 / vitest **1128/1128（81 文件）**；visual:expand 全断言通过（4 帧）。ps 自查每跑前执行；其间捕获 wt-59 占用 dev-app 通道（smoke:electron），遵守串行未并跑。
  - **范围外发现（无票，另报操作者）**：`npm run visual:transcript` 基座 harness 在 2d fork-toast 段 FAIL——期望 toast 含 "Forked"，实得 "This session has no live host…"。已 stash 复测干净 HEAD 同样失败（非本票引入）：票 51 的 toast ACK 化后，synthetic 无 host 会话永远无法触发 Forked ACK，基座 2d 断言失效。建议单独小票修基座（emit fork 后补一个新 id 的 session_created 公告）。
  - **交接**：不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 58`。
