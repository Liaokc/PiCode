# 29: 侧栏拖宽 + 两面板宽度持久化

**What to build:** 左侧栏右缘加拖拽手柄（交互模式同侧面板 resizer 先例）：宽度 clamp **240–520px、默认 320**，**双击手柄重置默认**；侧栏宽度与右侧面板宽度**均持久化**，重启保持——两个可拖面板行为一致。

**背景（取证）：** `.sidebar` 宽度钉死 `var(--sidebar-w: 320px)` 无 resizer；侧面板 resizer 有现成 pointer-capture 模式；面板宽度当前不持久化（重启回默认）——本票一并补齐。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 侧栏右缘拖拽手柄工作；宽度 clamp 240–520、默认 320
- [ ] 双击手柄重置默认
- [ ] 侧栏宽度 + 侧面板宽度均持久化（重启保持）
- [ ] clamp / 持久化纯函数表驱动；偏好 normalize/merge 更新
- [ ] electron smoke（拖宽 + 重启保持）；visual 走查帧；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q2 定稿（方案 a + panel 一并持久化）。归类：全新需求（ZCode parity）。波次：W2（Sidebar aside 区写者，与 34 的 TaskItem 区不相交）。
