# 37: 轨迹工具面——活跟随 + 搜索 + 块型开关 + 展开收起

**What to build:** Trace tab 四件工具（对照 ZCode 实拍）：
① **活跟随**：会话文件增长即重推导推送（复用 follow 通道语义），运行中会话的轨迹实时刷新——轨迹的核心场景是「后台会话跑到一半想看它干了什么」，快照会立刻过期；
② **搜索**：头部搜索钮开输入框「搜索调用轨迹内容…」+ 匹配计数 + ↑↓× 导航（`z-trace-search.png`）；
③ **块型开关**：自定义展开面板——系统提示词 / 用户消息 / 思考过程 / 助手消息 / 工具调用 / 工具结果 六类块各一 toggle（`z-trace-block-toggles.png`）；
④ **全部展开↔全部收起**切换（打开默认全展开，`z-trace-expanded/collapsed.png`）。

**背景（取证）：** grilling Q10②③④ 定稿（活跟随 + 六钮中的搜索/开关/展开收起随本票）。渲染状态（开关/展开/搜索计数）为纯 reducer。

**Blocked by:** 36（骨架与载荷先行）。

**Status:** resolved

- [ ] 活跟随：文件增长实时刷新（follow 通道复用），停止条件与 FollowView 惯例一致
- [ ] 搜索：计数 + ↑↓× 导航；命中滚动定位
- [ ] 块型开关六项（默认全开）；展开↔收起切换
- [ ] 渲染状态纯 reducer 表驱动；electron smoke 增长刷新断言；visual 三态帧（全展开/全收起/搜索）
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-09-02 (merge session): 操作者明示已验收 → merged as **16472e7** (merge --no-ff onto main @ ebf419d；feat `354409d` + 导航修复 `7fdade5` 纯重放，**零冲突**——零代差开合)。main 终态审计：typecheck 绿，vitest **886/886**（68 files，+31 为 trace-view/sessions-index 用例），接缝幸存——trace-view.ts 纯 reducer + selectors（Seam-1 表驱动 27 用例）、TraceTab 四件工具接线（活跟随 follow 通道、搜索 n/m 环绕导航、六块型开关、展开收起）、smoke 七 trace stage（tab_open/entries/refresh/close/search/kind_toggles/expand_collapse/growth）、visual-trace 三态帧 tr1/tr2/tr3；27–36 全部既有 seam 完好，无冲突标记残留。**1.2 全线收官：11/11 resolved**（27–37）。
- 2026-09-02 (requirements intake): 建票。grilling Q10 定稿。归类：全新需求。波次：W5（1.2 收官票）。
- 2026-09-02 (t37-trace-tools): implemented @ 354409d。活跟随 = host 每 tick 按 size 变化重推导整载推送（sessions:trace-follow / sessions:trace-update，契约纯增量；多 trace tab 各占一槽，停止条件 = FollowView 惯例：视图消失即停尾）。搜索 = 计数 n/m（空 0/0）+ ↑↓ 环绕导航 + ×；命中块高亮并 scrollIntoView 居中；隐藏块型同时退出搜索语料。块型开关六项默认全开（sliders 钮弹出面板，Escape/外点关闭）。全部展开↔收起（默认全展开，材质化 collapsed 集，后到块保持展开；块头 chevron 单块切换）。渲染状态纯 reducer + selectors = src/shared/sessions/trace-view.ts（Seam-1 表驱动 27 用例）；行/块 memo + 位置键，增长推送只 diff 尾部。electron smoke 新增 trace_growth_ok（增长无重请求刷新）/ trace_search_ok / trace_kind_toggles_ok / trace_expand_collapse_ok，全绿 exit 0；visual:trace 三态帧 tr1-expanded / tr2-collapsed / tr3-search 对照 ZCode 实拍通过（含结构探针断言）。typecheck / lint / test 886 全绿。code-review 两轴：Standards 2 修复（孤儿注释、blockTextOf 重复）/2 接受，Spec 0 发现。请操作者 `bash scripts/merge-ticket.sh 37`。
