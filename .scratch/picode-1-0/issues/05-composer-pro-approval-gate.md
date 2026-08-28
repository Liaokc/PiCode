# 05: Composer 全量 + 审批闸门

**What to build:** 输入区达到规格全量：@ 文件/目录提及补全；`/` 菜单列出 Pi prompt templates、skills 与内置命令（模糊过滤+键盘导航）；图片粘贴发送；流式进行时的 Steer / Follow-up 显式选择与队列面板（可清空）；provider→model 级联菜单；Thinking Level 下拉；Access Mode 芯片映射审批闸门预设档位；对话内联 approve / deny-with-reason 审批药丸，remember 规则随预设持久化。

**Blocked by:** 03 聊天主线程全量。

**Status:** ready-for-human

- [x] 各输入增强对真 SDK 生效：模板展开、skills 触发、图片作为消息附件送达
- [x] busy 时 Steer 注入当前回合、Follow-up 入队排队，队列面板状态与清空即时一致
- [x] 模型菜单数据来自 Pi 可用模型真实分组；Thinking Level 直通会话
- [x] Access Mode 切换即时改变闸门档位；拒绝+原因阻止本轮工具执行；remember 后同类免询问
- [x] 补全/菜单键盘可达性完整（↑↓ Enter Esc），视觉对照截图 06 命令菜单形态

## Comments

- 2026-08-28: implemented on `t05-composer-approval`, head `f299214` (2 commits: `4cda0d0` feature + `f299214` review fixes). Typecheck/lint/316 vitest 全绿；真机 contract smoke PASS（新增 Round A 完整闸门链路：approval_required → approve+remember → 免问询复用、read-only 档位自动拒绝、deny-with-reason+terminate、steer/follow-up/clear_queue 队列链、thinking_level_changed、真实 model_changed（bella/GLM-5.3）、file_list）；electron smoke PASS；visual harness 新增 shot 4（/ 菜单，对照截图 06 同构）+ shot 5（审批药丸 + 队列面板 + busy 态 Steer/Follow-up 切换）。
- 实现要点：审批闸门 = Pi inline extension（`tool_call` hook，经 `extensionFactories` 注册，零 Pi 修改）；SDK 事件序为 tool_execution_start → gate → 结果，reducer 据此做药丸↔工具卡原地转换；deny 带 `terminate` 终止本轮，read-only 档自动拒绝不带 terminate（让模型改道）；remember 规则随档位持久（会话内，切档往返保留）；Steer/Follow-up 投递经 entry_appended/message_end 去重回显进转录。Access Mode 预设：Full Access / Standard(默认,变更类工具询问) / Read Only(变更类自动拒绝)。
- 人工验收遗留：① 对照 `.scratch/visual/4-command-menu.png` 与截图 06；② `npm run dev` 里真实粘贴/选择图片、`@` 补全、`/review` 类模板展开与 skill 触发的手感目检（自动化只保证了契约出口与真实菜单数据源）。
- 合并（在主 worktree 执行）：`cd ~/PiCode && git merge --no-ff t05-composer-approval`
