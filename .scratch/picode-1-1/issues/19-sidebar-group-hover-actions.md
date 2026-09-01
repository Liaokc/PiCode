# 19: 分组悬停操作——隐藏 / 新建任务（悬停框架）

**What to build:** 侧栏项目分组行悬停出现操作钮（形态对照 ZCode 实拍 `.scratch/compare/z-hover-group-zoom.png`），移开消失：
① **移除（隐藏）**：把该分组**从侧栏隐藏**——纯本地偏好（可持久化），**会话文件零改动**；设置页提供「隐藏的项目」恢复入口。被隐藏分组的会话仍出现在 ⌘K 搜索与 Groups 全部视图。绝不删除会话（grilling R3-Q5 拍板）。
② **新建任务**：以该分组 cwd 打开**新任务态**（项目芯片预选该目录，形态同票 17），首条消息照常送达。
本票交付悬停框架与上述两钮；**「查看文件」钮与侧栏文件浏览器由票 26 加入**（此前悬停仅出两钮）。

**背景（取证）：** 操作者痛点 1 原话（ZCode 同名能力）；三钮形态 `z-hover-group-zoom.png`、`⋯` 菜单含「× 移除」`z-menu-group-more.png`；空分组「暂无任务」同样悬停可操作（`zcode-w.png`）。

**Blocked by:** 17（新建任务依赖芯片形态）、22（按钮 tooltip 用统一组件）。

**Status:** ready-for-human

- [x] 分组行悬停出现操作钮（含空分组「暂无任务」态），样式对照 ZCode，移开消失
- [x] 隐藏：分组从侧栏消失 + 设置页「隐藏的项目」恢复入口；会话文件零改动；被隐藏分组的会话仍出现在 ⌘K 搜索与 Groups 全部视图
- [x] 新建任务：预选该 cwd 的芯片新任务态，首条消息（文本+图片）完整送达
- [x] 隐藏过滤为纯函数（vitest，先例 sessions-group 套件）
- [x] smoke/visual 更新（侧栏悬停态截图归档）；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 移除 = 隐藏（R3-Q5）；新建任务 = 芯片预选。
- 2026-08-31 (/to-tickets 重切): 「查看文件」（侧栏文件浏览器）拆至**票 26**；本票 = 悬停框架 + 两钮。Blocked by 22 为 prefactor（新按钮直接消费统一 tooltip 组件）。
- 2026-09-01 (implement session, t19): 实现于 `6438414`，Status → ready-for-human。要点：
  - **纯缝**：`filterHiddenGroups`（`shared/sessions/group.ts`，Seam-1）只投影分组列表——置顶行不被触碰（显式 pin 胜过分组隐藏）、⌘K（`searchTasks`）与 Groups 全部视图不被喂此过滤器，`sessions-group.test.ts` 用组合用例钉死「隐藏永不使会话不可达」不变式。`hiddenGroups: string[]` 进 `AppPreferences`（normalize 去重去空 / merge 整组替换 / `toggleHiddenGroup` 共享于隐藏与恢复两端），走既有 settings IPC 持久化，预 ticket-19 文档缺字段归 `[]`。
  - **悬停框架**：`⋯`（菜单含「Remove from sidebar」，形态对照 `z-menu-group-more.png`）+ 气泡加号「New task」两钮，悬停现形（CSS `:hover` 替换 grip 点）、移开消失，全部吃票 22 Tooltip（图标钮短描述态）；「查看文件」留票 26 中间槽位。空分组裁定：PiCode 分组从会话索引推导（恒 ≥1 会话），ZCode 的独立项目表不存在——悬停框架做在行级而非行内容级，空/过滤态构造上同样出钮；`zcode-w.png` 的「暂无任务」形态无 PiCode 对应物（已在本条记录为有意偏差）。
  - **新建任务**：`handleNewTask(cwd?)` 携 preset，`EmptyState` 按 preset key 重挂载——分组芯片预选压过遗留 dropdown override；⌘N/启动空态共享 chain key 不丢草稿。m8 取证有判别力：焦点会话是 api-server（链式默认也应是 api-server），点 web-app 分组的 ⊕ 芯片读出 **web-app**。首条消息（文本+图片）走票 17 `startTask` pending 链（smoke 票 17 阶段已覆盖送达）。
  - **设置页恢复**：General 新增 Sidebar 卡「Hidden projects」，逐项 Restore（空态提示 No hidden projects）；隐藏时 toast 指路（超 spec 一点点，符合 toast 作为唯一非阻塞通知面的惯例，特此披露）。
  - **visual:multi 扩展**：m3 悬停（sendInputEvent 合成真鼠标移过才有 CSS `:hover`）/ m4 菜单 / m5 隐藏（组头+任务行消失+toast）/ m5b ⌘K 三条全命中 / m6a 恢复卡带隐藏项 / m6 恢复后 / m7 回工作区分组重现 / m8 芯片预选，全部 DOM 探针门禁后截图，归档 `.scratch/compare/m{3,4,5,5b,6,6a,7,8}-*.png`。新增 `isolateVisualUserData()`（index.ts 模块级、whenReady 前）：harness 的隐藏/恢复驱动**真实** settings service，userData 指向临时目录，绝不碰操作者真偏好。
  - **验证**：typecheck / lint / 620 unit 全绿（新增 12 个纯函数用例 + settings-service 文档形状更新）；smoke 未扩新阶段（本票改动面 = 侧栏投影 + 设置卡 + 空态 preset，无新契约事件；全量 smoke 含真实模型调用受 dev-app 串行约束，留待合并会话/操作者按惯例执行）。code-review 双轴：Standards 无硬违规（判定项 = filterHiddenGroups 单消费方的轻泛型）；Spec 五项验收逐条落实，两项披露（hide toast、空分组形态偏差），无范围外行为。
  - 合并：请操作者执行 `bash scripts/merge-ticket.sh 19`。
