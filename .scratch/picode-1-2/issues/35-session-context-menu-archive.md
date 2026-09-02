# 35: 会话行右键菜单 + 归档

**What to build:** 会话行**右键菜单九项**（分组与顺序对照 `z-context-menu.png`）：Pin task / Rename task / **Archive task** / **Mark as Unread(↔Read)** / ─ / **Reveal in Finder** / **Copy task path** / **Copy session file path** / **Copy session ID** / ─ / View call trace（入口本票就位、消费随票 36）。**归档** = 会话级本地偏好（会话文件零改动）：行悬停归档钮**临时替换状态点槽**（零重叠零位移，grilling Q6①-i）；归档行从侧栏两视图消失、**⌘K 仍可达**；侧栏 Trash 死钮接成**归档列表视图**（侧栏换装，文件浏览器模式先例）+ 一键恢复；置顶归档隐含取消置顶。

**背景（取证）：** ZCode 右键菜单实拍（`z-context-menu.png` 15 项）与悬停态（`z-session-hover-archive.png`：置顶行 pin 行首 + 悬停 🗑）；无 Pi 语义的 ZCode 项（分屏/前往配置/反馈）不做，标记未读经 grilling Q7 转正。归档悬停钮「替换点槽」为操作者拍板（Q6①-i）。既有机制：票 19 分组隐藏偏好模式 + 「隐藏永不使会话不可达」不变式。

**Blocked by:** 28（未读模型 + 点槽语义）、34（TaskItem 行几何先行）、33（Trash 钮与工具区序列化）。

**Status:** ready-for-agent

- [ ] 右键菜单九项就位（trace 项入座）；Mark as Unread/Read 接票 28 手动覆盖位
- [ ] 归档：悬停钮临时替换点槽；两视图列表消失、⌘K 可达、置顶归档隐含取消置顶、会话文件零改动
- [ ] Trash 死钮 → 归档列表视图 + 一键恢复
- [ ] Reveal in Finder / Copy task path / Copy session file path / Copy session ID host IPC（只读）
- [ ] 归档过滤纯函数表驱动（不变式：隐藏永不使会话不可达）
- [ ] visual 帧（菜单 / 归档 / 恢复）；electron smoke（归档 + 恢复 + 菜单动作 IPC 触发）；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q6（①-i ②③按推荐）+ Q7（九项子集 + 未读转正 + 轨迹转正）定稿。归类：全新需求。波次：W3（TaskItem 唯一写者）。
