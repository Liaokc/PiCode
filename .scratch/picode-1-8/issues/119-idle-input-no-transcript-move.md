# 119: 空闲输入不移动转录——agentRunning 门 + 底部目标查证

**What to build:** agent **非运行态**（settled/idle）下 composer 的任何操作（输入/删除/换行/高度变化/附件增减）**绝不移动转录滚动位置**——实现 = 转录滚动补偿/重钉路径的 `agentRunning` 门（精确触发源 dev app 插桩定位后落门，落点票内裁量：scroll-stay 纯模型入参或 ChatView 效应守卫）；**Copy/Fork 行等尾部元素计入底部目标**查证（操作者假设「复制按钮可能不算底部」——若定位证实重钉目标漏尾部元素，一并修）；**运行态语义零回退**（票 93 自发送闩、票 94 折叠锚定、票 75 滚轮永远赢、回底钮显隐全不破）。

**背景（取证）：** 操作者实测（图1→图2）：agent 已停止，输入框任何操作 → 转录上移（消息尾 Copy/Fork 行被推出视口，视图落点 = 消息文本尾、尾部动作行不可见）。静态排查：`ChatView.tsx:145-185` stick effect deps = [entries, expandedTurns, session]（不含 composer 高度）；composer auto-grow 纯 imperative 写高度（无 setState 不触发效应）——**精确触发源静态未定位**（嫌疑：composer 高度变化引发的滚动裁定点/重钉、或 browser 层锚定残余）。操作者机制推测：「一旦检测到输入框有变化，自动校准上方会话的显示到会话底部（复制哪些按钮可能是不算底部？）」。

**Blocked by:** 117（弱邻接转显式串行——composer 高度舞步与转录滚动的交互验证依赖 117 落地）.

**Status:** ready-for-agent

## Acceptance

- [ ] **dev app 插桩复现 = 第一验收项**：agent 停止态输入 → 转录移动的触发源证据链（哪个写入动了 scrollTop/scrollIntoView/锚定）留档
- [ ] 修复后 electron smoke：空闲态输入/删除/高度变化转录 scrollTop 逐帧不变；Copy/Fork 行在视口内不丢
- [ ] 运行态回归全保留：四路发送落底（票 93）、折叠锚定两态（票 94）、上翻接管（票 75）、回底钮显隐
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P26 定稿为 R18。触发源静态穷尽未定位（stick deps 不含 composer、auto-grow 零 setState）——复现定位 + 修复同票；操作者机制推测两处（自动校准到会话底部 / Copy 行不算底部）列为插桩方向。
