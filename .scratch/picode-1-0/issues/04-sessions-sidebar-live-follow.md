# 04: 会话体系与侧边栏 + Live Follow

**What to build:** 任务列表按项目目录分组呈现 Pi 会话存储中的全部 Session（含 TUI 创建的），带相对时间与置顶；⌘N 新建任务；resume 任意会话、in-place 树导航（回分支、跳 entry）、fork；任务重命名写回 Pi session label；**Live Follow**：正在 TUI 中运行的 Session 在列表中显示活跃态，点开为只读实时刷新视图。

**Blocked by:** 02 Host 活体。

**Status:** ready-for-agent

- [ ] TUI 新建的会话自动出现在对应项目分组，时间/置顶/重命名生效
- [ ] 双向无缝衔接：这里 resume 的会话与 TUI 继续的是同一条历史
- [ ] 树导航可切换分支并继续对话，分支路径不丢失
- [ ] Live Follow 只读旁观：TUI 流式进行时实时刷新，且 PiCode 侧零写入（并发保护默认策略）
- [ ] 侧边栏交互对照截图 01/02 左栏形态（分组行、筛选行、底部账户区）
