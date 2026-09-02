# 31: 预览多文件 tab + 标签页管理下拉 + 最近关闭

**What to build:** 侧面板 Preview 升级**多文件 tab**：每打开一个文件一张 tab（× 可关、互不影响），tab 身份扩展为 `review | file(cwd, path) | trace(sessionFile)`（trace 槽位本票就位、消费随票 36）。tab 条 ⌄ 从「收起面板」改为**标签页管理下拉**（对照 `z-tab-dropdown.png`）：搜索框（计数 + ↑↓× 导航）+「打开的标签页」+「最近关闭的标签页」（相对时间，**偏好持久化容量 10**，点击重开）。「收起面板」由标题栏切换钮 + ⌥⌘B（票 27）承担。深链 openPreview 语义从「替换目标」变「开新 tab / 聚焦既有」。

**背景（取证）：** 现状面板仅 Review/Preview 两张固定 tab、Preview 单文件目标；ZCode 实拍为多文件 tab + 管理下拉（`z-tab-dropdown.png`，含「最近关闭的标签页」7小时/8小时/21小时列表——跨重启持久化）。grilling Q4 操作者拍板完全 parity（方案 a）。

**Blocked by:** 30（SidePanel 热点文件 + memo 性能基建先行）。

**Status:** ready-for-agent

- [ ] 文件各成一张 tab（× 可关互不影响）；tab 身份 = review | file | trace（trace 消费随票 36）
- [ ] ⌄ 开管理下拉：搜索（计数 + 导航）+ 打开的标签页 + 最近关闭（相对时间、持久化、容量 10、点击重开）
- [ ] 深链 openPreview = 开新 tab / 聚焦既有（review→file、浏览器→file 深链同样）
- [ ] tab 框架纯 reducer 表驱动（panel-model 套件扩展：open/close/activate/最近关闭栈）
- [ ] electron smoke（多 tab 开关 + 下拉 + 重启保持）；visual 帧核验；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q4 定稿（方案 a）。归类：全新需求。是票 36 的前置件（tab 身份模型先扩）。波次：W2（SidePanel/PreviewTab 唯一写者）。
