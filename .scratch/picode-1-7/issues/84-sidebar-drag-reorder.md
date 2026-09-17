# 84: 侧栏拖拽重排——组内会话序 + 组间序 + Manual 排序

**What to build:** 侧栏拖拽重排端到端：①**项目组内拖拽会话排序**；②**项目组之间拖拽排序**（组顺序）。筛选下拉 Sort by 增第三项 **Manual**——首次拖拽自动切入（下拉可见勾选）；手动顺序（组内行序 + 组序）持久化于本地偏好（重启保留、**会话文件零改动**）；切回 Updated/Created = 自动排序生效（手动顺序保留不生效，再拖回 Manual）。组行 ⋮⋮ 图标转正为**真拖拽句柄**（Projects 分区行的 grip 删除——无分区重排语义）；会话行 = 行本体拖拽（句柄形态票内裁量）；灰行（cwd missing）照常可拖；拖拽动画/放置指示对齐 ZCode 构图。**Timeline 视图与置顶区不参与拖拽；跨项目移动会话不做**（会话项目身份 = 文件头 cwd——改它 = 写 Pi 会话文件 = 红线）。

**背景（取证）：** grips 现为无 handler 静态图标（`Sidebar.tsx:715` 分区行 / `:784` 组行，hover 让位 `app.css:838`）；组序与组内行序现全由排序键派生（`group.ts:88-90`——Updated/Created 切换合法翻转组序）；偏好持久化走 `settings.preferences`（hiddenGroups/readStates 同库）；ZCode 校准 = `workspaceSidebar.reorderSection`「移动分区」+ 任务拖拽 drop zone（bundle 键表）。ZCode 空组 drop zone 不做（PiCode 无空组形态）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 表驱动：分组纯模型增手动顺序（组内 map + 组序数组）——拖拽置位/跨组序调整/Manual 切换/Updated-Created 切回（手动保留不生效）全表
- [ ] 拖拽只改本地偏好，会话文件零改动（断言：重排前后 sessions 目录字节不变）
- [ ] Timeline / 置顶区无拖拽；灰行组内可拖；重启后手动顺序保留（本地偏好持久化）
- [ ] electron smoke：拖拽会话行（组内换位）+ 拖拽组行（组间换位）+ 下拉 Manual 勾选态
- [ ] 组行 grip 成为拖拽句柄、Projects 分区行 grip 删除；筛选下拉新增 Manual 项
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（"Manual" / "Collapse all" 族词汇表见 spec）
