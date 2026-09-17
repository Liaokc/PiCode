# 107: 文件浏览器实时刷新 + 置顶行 View files 入口

**What to build:** 两件侧栏文件浏览器（ticket 26 FileBrowser）修缮：①View files 打开的目录树**实时反映磁盘变化**（新增/删除/改名在树中可见，无需返回重进）——实时刷新优先；仅当实时通路被实测证明不可靠（漏事件 / .git 事件风暴 / 性能劣化）时降级加**手动刷新钮**（浏览器标题栏 back 钮旁）。②置顶区会话行（ticket 33，两视图共用的 Pinned 分区）hover 增加 **View files 入口**——当前 View files 只在项目组头 hover 三钮位（票 26），置顶行（Timeline 平铺下无组头可达）无入口；点击切到该会话所属项目的文件浏览器（与组头同 `setBrowserTarget` 通路）。

**背景（取证）：** FileBrowser 数据 = `window.picode.preview.load(cwd, path)` 既有预览目录读通道（契约无新事件），已加载子目录**缓存于 reducer**（`children` 记录，`requested` 防重入），无任何失效/重读路径；main 侧全仓无 `fs.watch`（grep 实证）。置顶区在两视图恒置顶渲染（`Sidebar.tsx` Pinned section，`grouped.pinned` → TaskItem），行 hover 动作只有 pin/rename/archive 槽（票 35 状态点锚位），无 View files；置顶会话的项目 cwd 需经会话→组映射取得（不依赖组头渲染）。实时刷新两条实现路径（票内裁量，验收项定门槛）：**a) watch 通路**——main 侧 fs.watch 递归监听 cwd（**契约增量**：新 IPC 事件 additive-only + host-contract smoke 报备入账，同 90/96/97/100 先例；须过滤 .git/node_modules 类事件风暴，watcher 生命周期随浏览器挂载/Back 卸载）；**b) 零契约通路**——既有 preview 通道失效重读（聚焦/展开/轮询择机）。操作者原话裁决：实时刷新要做；刷新钮仅在实时不可靠时可以不做。

**Blocked by:** 84（Sidebar.tsx 同热点——84 拖拽重排先落定，本票置顶行改动在其上收；FileBrowser 本体与 84 无碰撞，如需提前可拆票，见 Comments）

**Status:** ready-for-agent

## Acceptance

- [ ] 文件浏览器实时性：打开 View files 后，磁盘新增/删除/改名（已展开目录即时可见；懒加载目录首次展开为现读）无需返回重进即反映——watch 或失效重读通路二选一，核心失效/重读逻辑表驱动 vitest 覆盖
- [ ] 若走 watch 通路：新 IPC 事件 additive-only 入 contract + host-contract smoke 报备入账（先例 90/96/97/100）；watcher 随 unmount/Back 清理零泄漏（重复进出 10 次句柄数不增长）；.git 等高频目录事件过滤有测试
- [ ] 若实测实时通路不可靠（漏事件/风暴/性能证据留档 Comments）：浏览器标题栏加手动刷新钮（back 钮旁，全英文文案），点击重读全部已展开目录；可靠则明确不做按钮并在 Comments 记录实测依据
- [ ] 置顶区会话行 hover 出现 View files 入口（Timeline 与 By-project 两视图 Pinned 分区行为一致），点击切到该会话所属项目 cwd 的文件浏览器；组头既有三钮位零回归（票 26 探针）
- [ ] 归档/隐藏组语义不破（票 35 `filterArchived`/`filterHiddenGroups` 管线不动——置顶行入口走会话→cwd 映射，不依赖组渲染）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文 UI 文案
- [ ] electron smoke：新增或扩展 stage 断言置顶行 View files 入口 + 所选刷新通路的行为

## Comments

- 2026-09-17 (merge session，操作者口头需求入册)：需求转写两条 + 码库取证（FileBrowser 无刷新/无 watch、已加载目录缓存于 reducer；置顶行无 View files 入口；preview.load 通道既有可复用；CONTEXT.md 无文件浏览器独立词条——若随票立词条则实时刷新语义一并入册）。**波次归属待操作者确认**：建议排 84 之后（同 Sidebar.tsx 串行避冲突）；若需提前，①文件浏览器刷新可拆票先行（与 84 无碰撞），②置顶行入口仍候 84。合并会话仅入册，不开发。
- 2026-09-17 (merge session，操作者裁决「按 Blocked by: 84 走，波次合并会话调整」)：107 排入 **W9**（与 105/106 同波；W8 已满员 101/103/104）。阻塞 84 为 W2，到 W9 时窗早已解除；与 105（TerminalDock）/106（registry 注入）零碰撞。T107 会话 prompt 已随 session-prompts.md 入册（分支 t107-fb-refresh-pinned-viewfiles，基线含 84 的 Sidebar 结构）。波次表头部波数同步修正 8→9。
