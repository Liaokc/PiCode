# 36: 调用轨迹 tab 骨架——契约 + 载荷构建 + 默认全展开列表

**What to build:** 右键菜单 **View call trace** → 右侧面板打开 **Trace tab**（tab 身份 = 会话文件，复用票 31 框架）。host 从会话 jsonl 条目流**纯函数**构建 per-call 载荷：**entry = 一次模型调用**——输入节（自上一 assistant 消息以来的 user / 工具结果块）+ 输出节（思考 / 助手文本 / 工具调用块，带工具名 chip 与调用 id），块类型六种；usage 列（IN/OUT tokens、时长、时间戳）按 ADR-0002 从每条 assistant 消息 usage 推导——**契约纯增量**（trace 请求 / 数据消息；usage 缺席优雅降级为只显时间戳）。列表**默认全展开**、长块就地截断 + 展开钮；头部 = 标题 + 统计行（调用数 · 总 token · 模型可推导时）+ 刷新 / 关闭 / 打开所在目录（会话 jsonl）。数据源如实原则：轨迹显什么 = Pi 会话文件实际记录了什么（无 ZCode 式标题生成调用；SDK 内部 system prompt 不落盘，「系统提示词」块通常缺席）。

**背景（取证）：** ZCode 轨迹实拍五帧（`z-trace-{header,search,block-toggles,expanded,collapsed}.png`：entry 头 `[序号][类型 chip][状态] IN·OUT·时长·时间戳`、输入/输出两节、工具结果入下一 entry 输入节）。TranscriptItem 有 timestamp 与完整工具输出，缺 usage 列（契约补）。grilling Q10 定稿（①入口 ②活跟随随票 37 ③内容形态 ④契约增量）。

**Blocked by:** 30（性能 memo 基建）、31（tab 身份框架）、35（菜单入口槽位）。

**Status:** ready-for-agent

- [ ] 右键 View call trace 打开 Trace tab（任何会话，含 TUI 会话——只读读文件）
- [ ] host 纯函数载荷构建（六类块、usage 列、缺席降级）+ 契约纯增量往返
- [ ] 列表默认全展开 + 长块截断/展开钮；头部统计行 + 刷新/关闭/打开所在目录
- [ ] 载荷构建器表驱动（fixture jsonl：usage 齐全 / 缺席 / 非常规条目）；host-contract smoke 往返；electron smoke 打开→条目断言
- [ ] 性能预算：大文件实测数字记录在票内；超预算时块内容窗口化/懒展开
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。原判「调用轨迹无语义」已被操作者实拍纠正（Q7），全票为全新需求。36/37 拆分 = 单上下文窗口体量限制（骨架 / 工具面）。波次：W4。
