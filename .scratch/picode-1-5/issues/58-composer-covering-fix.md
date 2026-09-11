# 58: Composer 遮盖修复——文本区右 padding 预留按钮区

**What to build:** Composer 输入区右侧 padding 从 18px 增至约 44px（预留右上角展开钮区：right 偏移 8 + 宽 26 + 余量），首行文本与光标**永不穿钮下**；折叠态与展开态（280–560px）同规则；展开钮的位置（输入卡右上角，票 49 Q12 操作者拍板）与按钮 chrome 零变化。New Task 与会话内共组件自动同享。

**背景（取证）：** `.composer-input` 右 padding 18px；`.composer-expand` 绝对定位 right:8px 26×26 不透明卡色底（注释自述 "text flowing beneath stays masked"——有意遮盖设计）→ 首行文本与光标从钮下穿过被盖（pi15-composer-icon-covers-text）。修法 = padding 让位（Q5 拍板 A，保位置；被拒：移 footer——推翻票 49 拍板 / 透明底——字钮重叠更糟）。ZCode 无此钮（操作者批准偏离项），无校准参照。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 输入区右 padding 预留按钮区：折叠态首行文本在按钮左缘前换行、光标全程可见；展开态同规则
- [ ] 按钮位置/top-right 锚定/hover 形态零变化；两处 composer 同享
- [ ] visual harness：文本贴钮帧（长首行）+ 展开态帧
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 58`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R3，Q5=A）。波次 W1。纯 CSS 级小票（缺陷，票 49 引入）。
