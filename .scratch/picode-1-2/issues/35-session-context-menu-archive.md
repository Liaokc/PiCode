# 35: 会话行右键菜单 + 归档

**What to build:** 会话行**右键菜单九项**（分组与顺序对照 `z-context-menu.png`）：Pin task / Rename task / **Archive task** / **Mark as Unread(↔Read)** / ─ / **Reveal in Finder** / **Copy task path** / **Copy session file path** / **Copy session ID** / ─ / View call trace（入口本票就位、消费随票 36）。**归档** = 会话级本地偏好（会话文件零改动）：行悬停归档钮**临时替换状态点槽**（零重叠零位移，grilling Q6①-i）；归档行从侧栏两视图消失、**⌘K 仍可达**；侧栏 Trash 死钮接成**归档列表视图**（侧栏换装，文件浏览器模式先例）+ 一键恢复；置顶归档隐含取消置顶。

**背景（取证）：** ZCode 右键菜单实拍（`z-context-menu.png` 15 项）与悬停态（`z-session-hover-archive.png`：置顶行 pin 行首 + 悬停 🗑）；无 Pi 语义的 ZCode 项（分屏/前往配置/反馈）不做，标记未读经 grilling Q7 转正。归档悬停钮「替换点槽」为操作者拍板（Q6①-i）。既有机制：票 19 分组隐藏偏好模式 + 「隐藏永不使会话不可达」不变式。

**Blocked by:** 28（未读模型 + 点槽语义）、34（TaskItem 行几何先行）、33（Trash 钮与工具区序列化）。

**Status:** ready-for-human

- [ ] 右键菜单九项就位（trace 项入座）；Mark as Unread/Read 接票 28 手动覆盖位
- [ ] 归档：悬停钮临时替换点槽；两视图列表消失、⌘K 可达、置顶归档隐含取消置顶、会话文件零改动
- [ ] Trash 死钮 → 归档列表视图 + 一键恢复
- [ ] Reveal in Finder / Copy task path / Copy session file path / Copy session ID host IPC（只读）
- [ ] 归档过滤纯函数表驱动（不变式：隐藏永不使会话不可达）
- [ ] visual 帧（菜单 / 归档 / 恢复）；electron smoke（归档 + 恢复 + 菜单动作 IPC 触发）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q6（①-i ②③按推荐）+ Q7（九项子集 + 未读转正 + 轨迹转正）定稿。归类：全新需求。波次：W3（TaskItem 唯一写者）。
- 2026-09-02 (implement session, t35-context-menu-archive): 全项落地，feat sha `1ee6c6a`。
  - 九项菜单：`sessionMenuGroups` 纯模型（Seam-1 表驱动），Pin/Rename/Archive/Mark as Unread↔Read │ Reveal/Copy×3 │ View call trace 入座（trace 点击为 no-op，消费随票 36）；electron smoke 断言 9 项 / 3 组 / ZCode 顺序。
  - 归档：`archivedSessions` 偏好 + `filterArchived` 纯投影（两视图 + Pinned 均消费，⌘K 喂未过滤索引，「隐藏永不使会话不可达」不变式测试在案）；置顶归档隐含取消置顶（visual 断言）；Mark as Unread/Read 接 `setManualUnread`（逐会话 upsert，与读追赶者互不覆盖）。
  - 悬停钮临时替换点槽：同槽锚点（visual 实测 button centerX == dot slot centerX 33.5）、零位移（titleLeft 46→46）、无重叠（right 41.5 < 46）；真输入 hover 驱动。
  - Trash 钮 → Archived 列表视图（整栏换装）+ 一键恢复；空态文案与「全部归档」提示就位。
  - host 只读 IPC `sessions:context-action`（reveal / copy，payload 主进程防御性解析，限容日志）；smoke 断言 copy-session-id / copy-task-path IPC 触发（reveal 不进 smoke——避免弹 Finder）。
  - 验证：typecheck / lint / vitest 824 绿；`visual:context-menu` 五帧全绿（.scratch/compare/t35-*）；electron smoke 全阶段绿（含 ticket-35 stage）。
  - 备注：① 归档行点槽替换的 CSS 对「有状态点的行」同样生效（run/unread 点 hover 隐去），visual 种子全为静默行（无点），点隐去未单独立帧——机制与空槽同一条选择器路径；② merge-ticket.sh 的 ticket Status 门槛只查 picode-1-0/1-1 目录，1-2 工单不经过该检查（脚本待更新，本票已按惯例把 ready-for-human 同步进分支）。
  - 不自行 merge —— 操作者执行：`bash scripts/merge-ticket.sh 35`
- 2026-09-02 (operator feedback round 1): 归档悬停钮弃用垃圾桶图形（与「删除」语义撞车），改用新增的归档盒描边图标 ArchiveBoxIcon（12px）。帧已重拍，不变量全部重验。sha `4d694f4`。
- 2026-09-02 (operator feedback round 1 cont.): 工具区「Archived tasks」入口钮同步换成归档盒——归档链路上不再有垃圾桶图形；归档 toast 与「全部归档」空态文案从 'trash button' 改为 'Archived view'。帧重拍重验。sha `3591fce`。
- 2026-09-02 (integration round, rebase onto t33): 票 33 合入后 rebase 整合完成，落位按操作者配方。要点：① 派生管线合成为唯一正确形——`listed = filterArchived(sessions, archivedIds)` 最上游，`groupSessions(listed, pinnedIds, sort)` 与 `timelineSessions(listed, pinnedIds, sort)` 并行消费；文本筛选（query/filtering/filterRef/filterSessions）随 33 退役；⌘K 仍喂未过滤 sessions。② 渲染取 33 双视图结构，35 的 TaskItem 七个新 props 补齐三处调用点（Pinned 区 git 自动接好，Projects shown.map 与 timeline 两处手工补）；空态提示保留两条件且去掉已退役的 `!filtering` 条件。③ dismissal effects 双留（33 下拉 + 35 右键菜单）；"View files" 入口补回 `setShowArchived(false)`。④ 三个记账提交因 main 上 merge session 已同步同内容而 drop（d7363c8/57edc9c/008d4f4 的票 Comments 均已在 main）。⑤ CONTEXT.md 归档条目措辞随 33 更新（视图名 Projects / Timeline；"Trash 钮"→"归档盒钮"）。验证门全绿：typecheck / lint / vitest 840（含 33 的 createdAt 契约用例）/ electron smoke（ticket-35 阶段全过）/ visual:context-menu 五帧 / visual:filter 三帧（dropdown/timeline/created sort/persistence）。Timeline 视图消费同一 `listed` 投影——归档过滤对两视图结构性生效（纯函数表驱动 + 管线单点取数可证）。分支现状：113af4e / b0bbef8 / 512faf4（rebase 后新 sha）。
