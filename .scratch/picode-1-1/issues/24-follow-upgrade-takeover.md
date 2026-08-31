# 24: Follow 升级——markdown 渲染 + Open 转正

**What to build:** Live Follow 视图两项升级：
① **结构化 + markdown 渲染**：FollowView 消费票 14 的结构化条目，渲染 markdown 与折叠态思考行/工具卡（现状纯文本 div，`##`/`**` 裸露——实拍 `pi-follow-raw-markdown.png`），保持严格零写入。
② **Open 转正**：目标会话非活跃（>120s 无写入）时出现「Open」；点击瞬间**重查活跃态**——仍活跃则 toast「仍在另一端运行」不转正，否则以既有 resume 链路完整打开（自动切换到该会话）。会话活跃时不出该按钮。

**背景（取证）：** 操作者实测：活会话点击进 Follow 后视图无出口（仅 Stop following）、TUI 停后仍锁只读；FollowView 现渲染纯文本（`pi-follow-raw-markdown.png`）。

**Blocked by:** 14（消费其结构化载荷）。

**Status:** ready-for-agent

- [ ] Follow 视图 markdown 渲染（对照 `pi-follow-raw-markdown.png` 修复裸露标记）
- [ ] Follow 视图含折叠态思考行/工具卡（消费票 14 结构化条目）；严格零写入回归
- [ ] 非活跃时出现 Open；点击重查活跃态——活跃 toast 拒绝 / 非活跃 resume 完整打开、无重复条目
- [ ] 活跃时不出 Open 按钮
- [ ] electron smoke follow 场景扩展（转正链路断言）；`npm run smoke` ALL GREEN
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 14 拆出（原 (a) 转正与 (c) 渲染两缺口合并为一票；取证 `pi-follow-raw-markdown.png`）。
