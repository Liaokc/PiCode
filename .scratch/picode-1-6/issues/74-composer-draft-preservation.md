# 74: Composer 草稿保留——per-session 槽 + New Task 单槽

**What to build:** composer 已打未发的内容（**文本 + 已贴图片**）在视图切换后保留：**per-session 草稿槽**（会话视图注册表扩展——修复多活动会话切换丢草稿的对侧）+ **New Task 单槽**（App 层级）；切走切回恢复对应槽；发送后自然清空；空草稿不占槽；**内存级**——重启即失（操作者拍板不需跨重启）。与 73 修好的切换行为联合验收（切走必达 + 切回草稿在）。

**背景（取证）：** composer 值为组件局部状态；ADR-0006 后台不渲染 + 切回重挂载——会话切换即丢；New Task 卸载同丢。Q7 被操作者否决（「草稿需要保留」）后 Q11 定界：文本+图片、内存级、一并做 per-session 槽。决议记录见 `../intake-grilling.md` R13 节。

**Blocked by:** 73（切换行为是其验收前提；同文件群 App/注册表串行）.

**Status:** ready-for-agent

- [ ] Seam-1 草稿槽纯模型（set/clear/restore；per-session 槽 + New Task 单槽；空槽不存）
- [ ] electron smoke：New Task 打字 → 切会话 → 回 New Task 草稿在；会话 A/B 各自草稿独立互不串；带图草稿（贴图 → 切走 → 切回 → 缩略图与附件在）
- [ ] 发送后草稿自然清空；重启不保留
- [ ] 术语 rider：「草稿（Composer Draft）」入 CONTEXT.md
- [ ] 纯 renderer 状态扩展，零契约增量；全英文文案
- [ ] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
