# 08: 终端 PTY + 桥接

**What to build:** Side Panel 的 Terminal 标签为完整交互式伪终端（xterm + node-pty）：用户自跑命令、独立 shell 会话、resize 重排、与应用观感一致的主题。**Bridge**：agent 正在执行的 bash 工具命令及其输出单向投屏进终端视图实时可见，用户输入绝不回注该执行流。

**Blocked by:** 06 面板容器 + Review 标签。

**Status:** ready-for-agent

- [ ] 日常命令使用顺畅：滚动不花屏、resize 重排正确、进程退出干净
- [ ] agent 执行 bash 时投屏区实时出现命令与输出；结束状态清晰
- [ ] 用户在终端的输入永不进入 agent 工具执行流
- [ ] fake-pty 缝测试覆盖投屏/resize/退出；真 PTY 冒烟脚本一条
