# 69: 菜单滚动跟随 + 键盘处理统一

**What to build:** 菜单选中行随键盘导航**滚动入可视区**（scrollIntoView nearest——对照 pi16-menu-no-scroll：灰底选中行压在列表底缘、下一项被裁切、列表不动）；composer 侧文本菜单键盘处理与弹层键盘处理**统一为一处实现**（一处管 clamp/取模，消除双轨——现两套并存且实际生效的是 ArrowDown 无界版）；四类菜单（斜杠/文件/权限/模型/思考）键盘行为一致；hover 驱动同一选中模型的既有行为不回归。

**背景（取证）：** MenuRow 全链无 scrollIntoView；两套键盘处理并存（composer 拦截版无界 + flatMenuKey 取模版被屏蔽）。file:line 级根因见 `../intake-grilling.md` R3 节。

**Blocked by:** 68（统一落在 68 重写后的菜单键盘路径上——同函数区段强串行）.

**Status:** ready-for-human

- [x] Seam-1 键盘边界规则测试（统一后的单处实现：clamp/取模一处管）
- [x] electron smoke / visual harness：长列表键盘导航选中行始终可见（对照 pi16-menu-no-scroll 帧）
- [x] 斜杠/文件/权限/模型/思考菜单键盘行为一致（↑↓ 循环或钳制规则单一）
- [x] hover 驱动选中不回归
- [x] 纯 renderer 改动，零契约增量；全英文文案
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-15 (implemented, t69-menu-scroll): 键盘处理统一为 `src/shared/composer/menu-keys.ts` 的 `flatMenuKey` + `clampIndex`（Seam-1 纯函数，零 React/DOM 依赖，menu-surface/slash-gate 先例）——**边界规则取钳制**（spec 允许循环或钳制取其一；理由：scrollIntoView 跟随后回绕会把已滚到端的视图拽回顶部，钳制给出单一可预期的端点规则）。五处消费方全部改走同一函数：composer 文本菜单适配器（原 DOM querySelectorAll 拦截版删除——ArrowDown 无界 bug 消灭）、Access/Thinking 弹层、Model 级联（provider ←→ 轴同走 clampIndex，不再取模）、settings 选择器列表（flatMenuKey 唯一另一消费方，同规则继承 wrap→clamp）。**Shift+Enter 永不选中**上收到 flatMenuKey 内部（票 68 不变量普适化：chip 菜单对修饰键自然 no-op）。文本菜单 pick 逻辑（pickCommand insert/builtin 分支 + applyMention）上提为 composer 单一 `pickTextMenuRow`——鼠标点击与键盘 Enter 唯一汇合点，list-menus 两组件转纯展示（onPickRow）。MenuRow 选中变化 `scrollIntoView({block:'nearest'})`（effect deps = [selected]，仅选中变化触发——性能红线；挂载即选中时触发 = model 菜单打开自动定位当前 provider 的既有行为升级为真滚到位）。list-menus 渲染侧 clamp 同步改走 clampIndex（一处纪律不自破例）。
- 2026-09-15 (verification): vitest 1327/1327 全绿（新 composer-menu-keys 表 16 行 + 防回绕探测 + 全程走查 + clampIndex 单元）；typecheck 双 tsconfig 干净；**visual harness 全跑 exit 0**：`4c-menu-scroll-follow`（12 行目录走到折缘，选中行恰在可视区内）/`4d-menu-scroll-bottom`（钳制底缘，列表已滚动、灰底行完整可见——对照 pi16-menu-no-scroll 病灶帧）/`4e-model-menu-locate`（14 provider 目录打开即定位 #11 Bella 于列底可视）/`4f-model-menu-scroll-bottom`（←→ 走到末行钳制停住），每步几何探针（选中行矩形 ⊆ 列表矩形）全过；**electron smoke 三次全绿**（standalone ×2 + 全套件 ALL GREEN 235s 六阶段，session store 零增长）：menu_keyboard 阶段 = 文本菜单 12 行走查两端钳制 + @ 菜单键盘 Enter 经单一 pick 路径插入（零 session 流量）+ access 菜单 Enter 选中即开即选层（幂等）+ access/thinking 走查钳制 + Escape 关闭 + model 级联 provider 轴钳制。**两次迭代修复**：① 初始版与 menu_surface 零匹配真回合并发流式，探针竞态偶发——阶段改为先等 composer 空闲（send 钮回归）再驱动；② access 键盘选中曾取下一层把会话切到 Read Only，卡死其后 ticket-75 阶段的工具审批——改为打开即选当前层（幂等，路由证明不变：弹层必关 + chip 标签恒等于高亮行）。**ps 自查按验收项执行**（两次捕获其他 worktree 在跑：wt-76、wt-74——等待锁释放后才跑 dev app/smoke/visual）。
- 2026-09-15 (code-review 两轴)：Standards 轴——Seam-1 纪律/工单注释/英文文案/零契约达标；list-menus 渲染 clamp 残留 Math.min 与「一处管」自我纪律冲突 → 改走 clampIndex（第三提交）。Spec 轴——验收项全对齐；两处裁量记录在案：钳制规则（spec 明文二选一）与 settings 选择器继承同规则（单一函数的一致性结果，非静默变更）。
- 2026-09-15 (环境观察，非本票): ticket-75 的 scroll75 阶段在流式中程序化上滚 60px 的 latch 断言偶发失败（「in-band hold did not latch」）——在干净 main 检出上复现同签名（DOM scrollTop 被拽回底），与本票零相关（本票不触碰 scroll-stay）；已留档供票 75 后续加固参考。
- **操作者：`bash scripts/merge-ticket.sh 69`。**
