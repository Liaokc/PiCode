# 34: 侧栏行几何打磨——置顶行零位移 + Show more 对齐

**What to build:** 置顶行布局定稿 **[点槽][标题][时间][橙色 pin]**——pin 固定行尾；时间为**定宽槽**，悬停只隐文字（visibility/opacity 过渡 ~150ms）、**pin 零位移**；非置顶行悬停 pin 出现在同一位置。**Show more / Show less** 文字左缘对齐组内会话行标题文本（非状态点）。

**背景（取证）：** 现状 DOM = [点][标题][pin][时间]，`:hover` 时间 display:none + pin 显隐瞬断（CSS 实证）——操作者痛点 7「太突兀」。Show more 文字起点 x=10 vs 组内标题 x=34（CSS 实证）——痛点 9。注意 ZCode 置顶行 pin 在行首（`z-session-hover-archive.png`），操作者明确不要该形态（grilling Q5 拍板方案 a）。

**Blocked by:** 28（TaskItem 行状态派生先行，同文件序列化）。

**Status:** ready-for-agent

- [ ] 置顶行 [点槽][标题][时间][pin]，pin 橙色固定行尾
- [ ] 悬停只隐时间文字（定宽槽保留），pin 零位移；淡出过渡 ~150ms；非置顶行悬停 pin 同位出现
- [ ] Show more / Show less 对齐标题文本（x=34）
- [ ] DOM 几何探针断言（票 15 密度探针先例）：悬停前后 pin x 不变
- [ ] visual 帧核验；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q5 定稿（方案 a：pin 行尾 + 定宽槽）。归类：交互打磨（含微缺陷 #9）。波次：W2（TaskItem 写者）。
