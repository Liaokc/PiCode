# 34: 侧栏行几何打磨——置顶行零位移 + Show more 对齐

**What to build:** 置顶行布局定稿 **[点槽][标题][时间][橙色 pin]**——pin 固定行尾；时间为**定宽槽**，悬停只隐文字（visibility/opacity 过渡 ~150ms）、**pin 零位移**；非置顶行悬停 pin 出现在同一位置。**Show more / Show less** 文字左缘对齐组内会话行标题文本（非状态点）。

**背景（取证）：** 现状 DOM = [点][标题][pin][时间]，`:hover` 时间 display:none + pin 显隐瞬断（CSS 实证）——操作者痛点 7「太突兀」。Show more 文字起点 x=10 vs 组内标题 x=34（CSS 实证）——痛点 9。注意 ZCode 置顶行 pin 在行首（`z-session-hover-archive.png`），操作者明确不要该形态（grilling Q5 拍板方案 a）。

**Blocked by:** 28（TaskItem 行状态派生先行，同文件序列化）。

**Status:** resolved

- [ ] 置顶行 [点槽][标题][时间][pin]，pin 橙色固定行尾
- [ ] 悬停只隐时间文字（定宽槽保留），pin 零位移；淡出过渡 ~150ms；非置顶行悬停 pin 同位出现
- [ ] Show more / Show less 对齐标题文本（x=34）
- [ ] DOM 几何探针断言（票 15 密度探针先例）：悬停前后 pin x 不变
- [ ] visual 帧核验；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (merge session): 操作者明示已验收 → merged as **c38a0f0** (merge --no-ff onto main @ 58a42b9)。零代差合并（merge-base = main tip d67578e），rebase/合并零冲突，无分级事件。main 终态审计：typecheck 绿，vitest **719/719**（62 files，本票无新增单测——验证面为几何探针），接缝幸存——Sidebar pin 行尾 DOM 重排 + `sb-task-*` 类体系、`npm run visual:row-geometry` 脚本入口、visual-row-geometry.ts + rg1–rg5 帧 + rg-row-geometry.json 签名、compare/t34-* 归档；既有 27（resolveKeybinding）/ 28（unread）/ 30（memo+rAF）seam 同仓共存，无冲突标记残留。帧属票特有新帧（证据规则第 1 条）。
- 2026-09-02 (requirements intake): 建票。grilling Q5 定稿（方案 a：pin 行尾 + 定宽槽）。归类：交互打磨（含微缺陷 #9）。波次：W2（TaskItem 写者）。
- 2026-09-02 (implementation, agent): 完成，代码 sha `867c4bc`（分支 t34-row-geometry）。DOM 重排为 [点槽][标题][时间][pin]（pin 行尾，Q5 拍板 a）；时间为 44px 定宽槽右对齐；悬停 visibility/opacity ~150ms 只隐文字；非置顶行 pin 同位淡入；Show more/less padding-left 34px 对齐标题文本。几何探针 = `src/main/visual-row-geometry.ts`（票 15 密度探针先例，`npm run visual:row-geometry`，违规 exit 1）：实测 pin x 四态（未置顶静息/悬停、置顶静息/悬停）全等 278px、时间槽 44px 各态不变且 "just now"（最长串）无裁剪、fades 0.15s×2、置顶 pin 橙色 rgb(236,121,49)、Show more/less 文字左缘 = 标题文字左缘（网格 x=34 精确）。帧 rg1–rg5 + rg-row-geometry.json 入库并归档 .scratch/compare/t34-*。typecheck / lint / vitest 719 全绿。红线：探针种子写隔离 store + 一次性 userData（pin 走真实按钮会写偏好）。未自行 merge——请操作者执行 `bash scripts/merge-ticket.sh 34`。
