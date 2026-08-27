# 05: Composer 全量 + 审批闸门

**What to build:** 输入区达到规格全量：@ 文件/目录提及补全；`/` 菜单列出 Pi prompt templates、skills 与内置命令（模糊过滤+键盘导航）；图片粘贴发送；流式进行时的 Steer / Follow-up 显式选择与队列面板（可清空）；provider→model 级联菜单；Thinking Level 下拉；Access Mode 芯片映射审批闸门预设档位；对话内联 approve / deny-with-reason 审批药丸，remember 规则随预设持久化。

**Blocked by:** 03 聊天主线程全量。

**Status:** ready-for-agent

- [ ] 各输入增强对真 SDK 生效：模板展开、skills 触发、图片作为消息附件送达
- [ ] busy 时 Steer 注入当前回合、Follow-up 入队排队，队列面板状态与清空即时一致
- [ ] 模型菜单数据来自 Pi 可用模型真实分组；Thinking Level 直通会话
- [ ] Access Mode 切换即时改变闸门档位；拒绝+原因阻止本轮工具执行；remember 后同类免询问
- [ ] 补全/菜单键盘可达性完整（↑↓ Enter Esc），视觉对照截图 06 命令菜单形态
