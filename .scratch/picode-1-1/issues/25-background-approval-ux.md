# 25: 后台会话审批 UX——挂起 + 角标 + 通知

**What to build:** 多活动会话（票 20）下，后台运行的会话撞上审批闸门时：审批药丸**留在该会话内挂起等待，绝不自动批准**；侧栏该会话亮**橙色待审批角标**；**系统通知**（点击跳转该会话——前台化并挂载视图）；切回后可正常批/拒，行为与前台一致。

**背景（取证）：** grilling R3-Q3 ① 定稿；审批闸门为票 05 交付的能力（per-execution 工具闸门 + remember 规则 + deny 路径）。

**Blocked by:** 20。

**Status:** ready-for-agent

- [ ] 后台会话触发审批：药丸滞留会话内、agent 挂起等待；侧栏橙角标出现
- [ ] 系统通知弹出，点击跳转该会话
- [ ] 切回后批/拒行为与前台一致（approve + remember 链路回归）
- [ ] deny 路径在后台同样终止本轮并更新转录
- [ ] electron smoke 扩展（后台审批场景断言）；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 20 拆出（grilling R3-Q3 ①：绝不自动批准 + 角标 + 通知）。
