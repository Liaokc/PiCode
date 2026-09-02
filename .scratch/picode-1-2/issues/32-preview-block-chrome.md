# 32: 预览块级供面转正

**What to build:** File Preview 的 **rendered markdown 态**启用与主转录相同的块级卡片：代码格（语言标签 / 复制 / 自动换行）与表格容器（复制 / 预览表格 / 展开表格滚动区域）——推翻票 16「预览保持裸排版」的范围裁定（操作者 2026-09-02 转正）。source 态（窗口化文本）不变。

**背景（取证）：** `PreviewTab` 显式以 chrome=false 渲染（注释「block cards are a transcript affordance (ticket 16)」）；操作者痛点 6。块级组件与块 key / 复制反馈机制票 16 已交付，本票是范围扩展非新造。

**Blocked by:** 31（PreviewTab 多实例化先行，避免同文件两写者）。

**Status:** ready-for-agent

- [ ] 预览 rendered 态代码格 / 表格卡片与主转录同款（按钮、tooltip、反馈一致）
- [ ] source 态不变（窗口化文本不套卡片）
- [ ] 块 key 稳定性回归不破（无流式，但换行 / 复制状态隔离正确）
- [ ] visual 帧核验（预览块卡片对照转录帧）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。归类：**已豁免项转正**（票 16 范围裁定被操作者推翻）。波次：W3（PreviewTab 唯一写者）。
