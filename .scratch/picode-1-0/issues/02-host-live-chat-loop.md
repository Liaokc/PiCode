# 02: Host 活体——最小聊天闭环

**What to build:** 用户选择工作目录后，独立 agent host 子进程以锁定版本的 Pi SDK 创建 Session 并完成第一轮真实对话：发送→逐词流式上屏→停止按钮中止。崩溃隔离（agent 死而窗口活，可重启会话）、退出无孤儿进程。自此确立 Seam-1：渲染层唯一事件来源是 IPC 契约，chat reducer 以纯函数承接。

**Blocked by:** 01 净场与脚手架。

**Status:** ready-for-agent

- [ ] 选目录→建 Session→真实模型流式回复全程走通
- [ ] 停止控制即时中止当前回合，应用保持可用
- [ ] kill host 进程后 UI 出现清晰错误横幅并可重建会话，窗口不崩
- [ ] 应用正常退出后系统内无残留子进程
- [ ] reducer 纯函数测试就位：文本增量、agent_start/end、错误事件
