# 99: 子代理对话 tab——一子代理一 tab、steer 发送、已结束只读

**What to build:** 子智能体供面第二票：点击目录 tab（票 90）的行 → **同侧板开一个以任务命名的对话 tab**（一子代理一 tab、tab 条 × 可关互不影响；转录渲染复用主转录组件族 + 底部 composer）。运行中子代理：composer 发送 = **steer**（RPC acknowledged 通道；投递回执如实上屏——delivered/queued/失败都可见）；转录随事件 live 更新。已结束子代理：**只读转录**（无 composer；resume 复活不做——豁免候选记录）。

**背景（取证）：** pi-subagents RPC steer（extension-api.md：acknowledged-delivery 回执、nonRecoveringSteer 语义）；子代理 transcript = 真会话文件 + 工件 events.jsonl 镜像；ZCode 构图 = z17-subagent-chat（tab 名 = 任务、转录 + 回底钮）。「显示的所有东西和功能跟主会话栏一模一样，并且操作者可以继续发送消息」（操作者对 ZCode 形态的描述）。

**Blocked by:** 90（子智能体桥接 + 目录 tab——目录行是入口、桥接是数据面）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：目录行点击开对话 tab（任务命名）；运行中子代理转录 live 更新；steer 发送 → 回执上屏；已结束只读（无 composer）
- [ ] 多 tab 并存互不影响；× 关闭不杀运行中的子代理（仅关视图——断言子代理仍在跑）
- [ ] 回底钮/滚动语义与主转录一致；横向边界：嵌套/foreign session 的错误路径如实显示
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
