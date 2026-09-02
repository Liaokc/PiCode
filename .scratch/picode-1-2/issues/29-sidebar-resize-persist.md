# 29: 侧栏拖宽 + 两面板宽度持久化

**What to build:** 左侧栏右缘加拖拽手柄（交互模式同侧面板 resizer 先例）：宽度 clamp **240–520px、默认 320**，**双击手柄重置默认**；侧栏宽度与右侧面板宽度**均持久化**，重启保持——两个可拖面板行为一致。

**背景（取证）：** `.sidebar` 宽度钉死 `var(--sidebar-w: 320px)` 无 resizer；侧面板 resizer 有现成 pointer-capture 模式；面板宽度当前不持久化（重启回默认）——本票一并补齐。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] 侧栏右缘拖拽手柄工作；宽度 clamp 240–520、默认 320
- [x] 双击手柄重置默认
- [x] 侧栏宽度 + 侧面板宽度均持久化（重启保持）
- [x] clamp / 持久化纯函数表驱动；偏好 normalize/merge 更新
- [x] electron smoke（拖宽 + 重启保持）；visual 走查帧；typecheck / lint / test 全绿

## Comments

- 2026-09-02 (feedback round 3, commit **8ea78d1**): 操作者实拍 16.48.12（双栏拉满后的 PiCode）四点反馈，全部实现并验证：
  - **主区最小宽度 420px**（`MAIN_ZONE_MIN_WIDTH_PX`，layout-model）：每栏 max-width = 窗口 − 另一栏 − 420（shell 挂 CSS 变量 + max() 下限钳在栏最小宽），App 提交钳制用同一 bound——提交值恒等于渲染值；两栏仍保持拖后宽度（flex-shrink:0），只在地板处让位。240+280+420=940 ≤ 最小窗口 1040，地板永可达。
  - **快捷任务 chips**：行自然宽度超过 composer 时隐藏（visibility，无回流跳动），不再溢出主区。
  - **欢迎语一行**：离屏克隆测量（直接改活动节点会与 reconciler 打架——跳过的提交把内联样式遗留在 DOM 上），字号逐步下调至一行且不超 composer 宽（亚线性缩放由逐级验证吸收）。
  - **Logo**：地板保证 watermark 不再溢出；两栏另加 z-index:1——ZCode 是栏遮 logo，永不反向。
  - smoke：地板钳制段（动态 bound——视口与标称窗口宽可有几像素差）+ chips 隐藏 + 欢迎语一行断言，持久化终值随钳制；captures 重拍为 3 帧（地板态）；761/761 绿、typecheck/lint 绿、visual 21 帧 gates 全过。
- 2026-09-02 (feedback round, commit **04810e8**): 操作者实拍对照 ZCode（桌面 12 帧截图）后两项增补，均已实现并验证：
  - **双栏挤压规则（ZCode 拖拽逻辑观察 5–8）**：侧面板 flex-shrink:0 + max-width:100%——拖后的面板各自保持宽度、主区吸收全部压缩，两栏可同时最大（smoke panes_hold_ok：侧栏 520 + 面板 620 同时成立）；max-width:100% 兜底持久化宽度超出窗口时不裁出屏。
  - **Composer 三档降级（对齐 15.53.17 / 15.53.32 形态）**：`src/shared/composer/density.ts` 纯函数 composerDensity(composer 实测宽度)——full 全文字 / compact（访问权限=图标、模型=仅名、思考=图标+绿色竖条）/ minimal（模型=Cube 图标、思考=图标、无 caret）；ResizeObserver 驱动，setDensity 同值 bailout（拖拽仅在过阈值时重渲染，≤2 次/drag）；全文字档 DOM 与旧行为逐字节一致；隐藏标签由 tooltip + aria-label 承接（CONTEXT.md 悬停规则）；chip span 禁换行（15.52.25 的溢出 bug 根因）。
  - **思考强度竖条**（操作者定稿设计）：按 Pi 七档规范映射 fifths——off 空条、minimal 1/5…xhigh 满格、**max = 满格 + 自上而下光泽扫过动画**（prefers-reduced-motion 降级）；绿色 #34a853（与 liveness dot 同源）。
  - smoke 扩展：compact/minimal 两档断言 + panes hold + 持久化终值改侧栏 520；760/760 绿、typecheck/lint 绿、visual 21 帧重拍 signature gates 全过（全宽档 composer DOM 零变化）。
  - 排查插曲：smoke 误报 minimal 超时 → 驱动脚本 waitForProbe 成功时 return undefined 的低级 bug（应用行为一直正确），已修。
  - **验收实拍帧**：`captures/`（1-default-sidebar-320 / 2-sidebar-max-520 / 3-compact-sidebar400-panel620 / 4-minimal-sidebar520-panel620），由 `npm run visual:layout`（scripts/smoke/layout-captures.mjs）真实拖拽后拍摄——compact 帧可见访问权限图标化 + 模型仅名 + 思考图标+空竖条（EmptyState 无会话时档位未设），minimal 帧可见双栏保持 + composer 全图标化，对齐 ZCode 15.53.17/16.18.16 形态。
- 2026-09-02 (implementation): 分支 t29-sidebar-resize，commit **388b52d**。实现：
  - `clampSidebarWidth`（layout-model.ts，240–520 / 默认 320，NaN 回退默认）与 ShellUiState.sidebarWidth + set/reset-sidebar-width 动作；表驱动 vitest（clamp 九例 + reducer 行为）。
  - Sidebar 右缘 resizer 复用票 30 交互模式（pointer-capture + rAF 直写 DOM + pointerup 一次 commit，方向取反：右拖加宽）；`.sidebar::after` 悬停 grip line 与面板同形；flex-shrink:0 取代 min-width 锁。
  - 持久化：AppPreferences 增 sidebarWidth/panelWidth（normalize/merge 走同一对 clamp 纯函数，junk 回退默认、无清除语义）；启动 settings 快照用裸 dispatch 播种（不回写）；App 层 persisting dispatch 包装（dispatchShellPersisting / dispatchPanelPersisting）拦截宽度动作才写盘——无变化不落盘，且 SidePanel.tsx / panel-model.ts 零改动（票 31 唯一写者约束），panel 宽度持久化在 dispatch 边界完成。
  - electron smoke `scripts/smoke/layout-persist-smoke.mjs`（npm run smoke:layout）：一次性 userData（main 新增 PICODE_LAYOUT_SMOKE_USER_DATA 隔离）+ CDP 真实指针拖拽两轮启动——320 默认 → 320→400 → 两端 clamp → 双击重置 → 定格 400；面板 ⌥⌘B 开、420→620；断言 picode-settings.json 两宽度；重启后侧栏 400 / 面板 620 恢复、双击重置仍工作且重置本身也持久化。全绿。
  - 测试：layout-model / preferences 表驱动扩展 + settings-service 字面量补齐；738/738 绿；typecheck / lint 绿；visual:transcript 重拍（signature gates 全过，帧差为工单内容代差 + 压缩噪声，几何零变化）。
  - code-review 双轴通过：standards 无硬伤（2 条判断型：拖拽逻辑与面板镜像未提取共享 hook——票 31 同文件约束下的有意取舍，注释已声明；持久化包装 ×2 同形保留）；spec 无缺失无越界（TaskItem / 工具区 / SidePanel / panel-model 未触碰）。
  - 未自行 merge——请操作者执行：`bash scripts/merge-ticket.sh 29`

- 2026-09-02 (requirements intake): 建票。grilling Q2 定稿（方案 a + panel 一并持久化）。归类：全新需求（ZCode parity）。波次：W2（Sidebar aside 区写者，与 34 的 TaskItem 区不相交）。
