# 37: 轨迹工具面——活跟随 + 搜索 + 块型开关 + 展开收起

**What to build:** Trace tab 四件工具（对照 ZCode 实拍）：
① **活跟随**：会话文件增长即重推导推送（复用 follow 通道语义），运行中会话的轨迹实时刷新——轨迹的核心场景是「后台会话跑到一半想看它干了什么」，快照会立刻过期；
② **搜索**：头部搜索钮开输入框「搜索调用轨迹内容…」+ 匹配计数 + ↑↓× 导航（`z-trace-search.png`）；
③ **块型开关**：自定义展开面板——系统提示词 / 用户消息 / 思考过程 / 助手消息 / 工具调用 / 工具结果 六类块各一 toggle（`z-trace-block-toggles.png`）；
④ **全部展开↔全部收起**切换（打开默认全展开，`z-trace-expanded/collapsed.png`）。

**背景（取证）：** grilling Q10②③④ 定稿（活跟随 + 六钮中的搜索/开关/展开收起随本票）。渲染状态（开关/展开/搜索计数）为纯 reducer。

**Blocked by:** 36（骨架与载荷先行）。

**Status:** ready-for-agent

- [ ] 活跟随：文件增长实时刷新（follow 通道复用），停止条件与 FollowView 惯例一致
- [ ] 搜索：计数 + ↑↓× 导航；命中滚动定位
- [ ] 块型开关六项（默认全开）；展开↔收起切换
- [ ] 渲染状态纯 reducer 表驱动；electron smoke 增长刷新断言；visual 三态帧（全展开/全收起/搜索）
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。grilling Q10 定稿。归类：全新需求。波次：W5（1.2 收官票）。
