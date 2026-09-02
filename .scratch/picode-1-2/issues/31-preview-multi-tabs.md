# 31: 预览多文件 tab + 标签页管理下拉 + 最近关闭

**What to build:** 侧面板 Preview 升级**多文件 tab**：每打开一个文件一张 tab（× 可关、互不影响），tab 身份扩展为 `review | file(cwd, path) | trace(sessionFile)`（trace 槽位本票就位、消费随票 36）。tab 条 ⌄ 从「收起面板」改为**标签页管理下拉**（对照 `z-tab-dropdown.png`）：搜索框（计数 + ↑↓× 导航）+「打开的标签页」+「最近关闭的标签页」（相对时间，**偏好持久化容量 10**，点击重开）。「收起面板」由标题栏切换钮 + ⌥⌘B（票 27）承担。深链 openPreview 语义从「替换目标」变「开新 tab / 聚焦既有」。

**背景（取证）：** 现状面板仅 Review/Preview 两张固定 tab、Preview 单文件目标；ZCode 实拍为多文件 tab + 管理下拉（`z-tab-dropdown.png`，含「最近关闭的标签页」7小时/8小时/21小时列表——跨重启持久化）。grilling Q4 操作者拍板完全 parity（方案 a）。

**Blocked by:** 30（SidePanel 热点文件 + memo 性能基建先行）。

**Status:** resolved

- [x] 文件各成一张 tab（× 可关互不影响）；tab 身份 = review | file | trace（trace 消费随票 36）
- [x] ⌄ 开管理下拉：搜索（计数 + 导航）+ 打开的标签页 + 最近关闭（相对时间、持久化、容量 10、点击重开）
- [x] 深链 openPreview = 开新 tab / 聚焦既有（review→file、浏览器→file 深链同样）
- [x] tab 框架纯 reducer 表驱动（panel-model 套件扩展：open/close/activate/最近关闭栈）
- [x] electron smoke（多 tab 开关 + 下拉 + 重启保持）；visual 帧核验；typecheck / lint / test 全绿 — 740/740、typecheck+lint 绿、electron smoke 全绿（含新 panel_tabs 阶段 + 重启保持）、visual 22 帧重拍含新 9-tab-dropdown

## Comments

- 2026-09-02 (merge session): 操作者明示已验收(含 feedback round 1 的两条桌面反馈处置)→ merged as **a689472** (merge --no-ff onto main @ 378b125；feat `7ad3d4f` + feedback `e382977`）。rebase 冲突两处均为同一例行级:票文件状态对撞(feat / tracker 中间态 vs main 终态)--均取 main 侧,两个 tracker 提交 81b8ecd / 5fd27af 随之去重丢弃;代码面 index.ts / visual.ts / app.css / smoke.ts 与 34 的注册行、CSS 区段**全部自动合并成功**,PNG 既有帧 31 重拍版干净重放(34 未动既有帧),零语义级对撞。main 终态审计:typecheck 绿,vitest **746/746**(62 files,+27 为 panel-model/preferences 用例),接缝幸存--PanelTabMenu、panel-model 结构化 tab 身份 + recentlyClosed(18 处)+ preferences 增量字段、smoke panel_tabs 阶段群(tab_one/two、dropdown、retarget_in_place、restart_keep、close_independent、reopen_after_restart)、9-tab-dropdown 帧入库;27/28/30/34 四票 seam 同仓共存,无冲突标记残留。附注:既有 21 帧由 31 会话重拍(含 28 特性--28 合入时的待重拍注记就此了结)。
- 2026-09-02 (requirements intake): 建票。grilling Q4 定稿（方案 a）。归类：全新需求。是票 36 的前置件（tab 身份模型先扩）。波次：W2（SidePanel/PreviewTab 唯一写者）。
- 2026-09-02 (implement, t31-preview-multi-tabs @ 8eb7b94): 落地。panel-model 结构化身份 `PanelTabId` + open/close/activate/最近关闭栈（hydrate 动作回填，close 时间戳走 action 保纯度，容量 10 去重重注）；preferences 纯增量字段 `recentlyClosedTabs`（防御式 normalize/merge，settings-service 往返有测试）；PreviewTab 改为每 tab 固定目标（memo 防 effect 重入）；深链单漏斗 openPreview = 开新 tab/聚焦既有；下拉组件 PanelTabMenu（搜索 n/m 计数 + ↑↓ Enter × 导航、打开的标签页、最近关闭相对时间、30s tick）；收起面板归标题栏 + ⌥⌘B。electron smoke 新 panel_tabs 阶段 + 重启保持；smoke 运行改用一次性 userData。顺手修票 25 deny 断言的 auto-fold 竞态。CONTEXT.md：Side Panel 定义更新 + 新术语「最近关闭的标签页」。
- 2026-09-02 (feedback round 1, @ c0894a5): 操作者桌面实拍反馈两条：(1) tab 条 tab 太长（激活胶囊撑到 ~175px 空心）——tab 改为贴内容自适应（flex-basis auto，上限 150px，拥挤时才收缩，overflow-x 兕底）；(2) 预览 tab 内点面包屑/目录行不应新开 tab——新增 `retarget-tab` reducer 动作：tab 内导航原地换身份（保持条位；导航到已开路径则聚焦既有并退役当前 tab，永不重复），只有侧栏深链（Review 树、转录卡片）才开新 tab；最近关闭历史不动（没关就没记）。测试 +6（retarget 套件），electron smoke 加 crumb 原地重定向断言（条数不涨、标签变目录名），visual 帧 6 改点激活 tab 的面包屑。746/746、typecheck/lint 绿、smoke 全绿、visual 22 帧重拍。不自行 merge — 请操作者运行 `bash scripts/merge-ticket.sh 31`。
