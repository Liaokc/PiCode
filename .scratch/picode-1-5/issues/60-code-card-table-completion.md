# 60: 代码卡与表格补齐——行号/下载/startLine + CSV/TSV

**What to build:** 代码卡补齐 ZCode 实证能力：**行号默认开**（模型可用 noLineNumbers 元参数关闭——所有代码卡视觉密度变化，操作者明知拍板）、**download 钮**（按语言推导扩展名存文件）、**startLine=N 元参数**平移起始计数；表格工具排增 **copy as CSV / copy as TSV** 两项（既有 copy as Markdown / preview / expand 三钮零回归）。表格 fullscreen 维持不做（ZCode 自身显式关闭）。

**背景（取证）：** ZCode 代码卡 = 行号默认（noLineNumbers 关）+ startLine=N + download/copy 双钮；表格 copyTable 家族 = copy / Markdown / CSV / TSV 四格式。PiCode 现状：代码卡无行号无下载；TableCard 仅 Markdown copy/preview/expand。

**Blocked by:** 59（同文件串行：Markdown 块投影与卡组件——59 先引入图卡投影基座，本票在其上补代码卡/表格能力）。

**Status:** ready-for-agent

- [ ] 行号投影表驱动：默认开 / noLineNumbers 关 / startLine=N 平移计数（含与既有 wrap/copy chrome 共存）
- [ ] download 钮：按语言推导扩展名存文件；与既有 copy 钮并排
- [ ] 表格 CSV/TSV 序列化纯函数 + 工具排两项新钮（全英文 tooltip）
- [ ] 既有 copy as Markdown / preview / expand 零回归（表驱动 + smoke 断言）
- [ ] electron smoke：行号显示 + download + CSV copy
- [ ] visual harness：行号帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 60`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R4 的代码卡/表格部分，Q6=C + Q11=A「全做，越完美越好」）。波次 W2，**Blocked by 59**。
