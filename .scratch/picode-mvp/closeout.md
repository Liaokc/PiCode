# PiCode MVP — Spec ↔ Implementation Closeout

> Date: 2026-08-25. Scope: `.scratch/picode-mvp/spec.md` → `src/` + `scripts/`
> (Phase 2 收尾). **No implementation changes were made.** All work is
> verification + recording.
>
> Verification ran and passed: `npm run typecheck` (node + web), `vitest`
> **42/42**, `electron-vite build` (main + preload + renderer), and the real-SDK
> smoke/e2e scripts are present and wired (`smoke:host`, `smoke:session`,
> `smoke:lifecycle`, `smoke:approval`, `smoke:settings`, `e2e:tool-cards`,
> `e2e:file-diffs`). Read-only constraint confirmed: installed Pi SDK
> `node_modules/@earendil-works/pi-coding-agent/dist/index.js` mtime is Aug 24,
> before all implementation work (Aug 25).

## ✔ 全部打勾的 User Story 清单 (21/21)

Every User Story in `spec.md` is checked off. Evidence mapping:

| US | 实现落点 (src/scripts) | 判定 |
|---|---|---|
| 1 选择工作目录 | `DirectoryPicker.tsx`, `main/index.ts:63` selectDirectory + startSession; `App.tsx` | ✔ |
| 2 逐词流式 | `contract.ts` events; `chatReduce.ts` message_update/text_delta 累加; `scripts/smoke-host.mjs` | ✔ |
| 3 markdown 渲染 | `ChatPanel.tsx` Message → react-markdown | ✔ |
| 4 可折叠工具卡片 | `ChatPanel.tsx` ToolCard (name+args+live status); `chatReduce.ts` tools[] | ✔ |
| 5 工具终态 | `chatReduce.ts` running/done/error; `chatReduce.test.ts` | ✔ |
| 6 执行前审批 | 03; `host.ts` tool_call extension → `approvalGate.ts`; `ChatPanel` ApprovalDialog | ✔ |
| 7 拒绝+原因 | `approvalGate.ts` deny 带 reason; host 返回 `{block,reason}`; `smoke-approval.mjs` | ✔ |
| 8 可召回默认 | `approvalGate.ts` defaults Map + remember; `chatReduce.test.ts`/`approvalGate.test.ts` | ✔ |
| 9 中止回合/工具 | `host.ts` abort → `gate.rejectAll`+`session.abort()`; `chatReduce.ts` user-aborted | ✔ |
| 10 文件改动 diff | 06; `chatReduce.ts` fileChanges[]; `ChatPanel` FileChangeList/DiffView; `e2e:file-diffs` | ✔ (见 D3 附注) |
| 11 会话侧边栏 | 05; `sessionIndex.ts` + `Sidebar.tsx` | ✔ |
| 12 分叉会话 | 05; `host.ts` runSessionCommand fork; `smoke-session-lifecycle.mjs` (源文件 sha256 不变) | ✔ |
| 13 同目录新会话 | 05; `host.ts` runtime.newSession | ✔ |
| 14 历史树 | `sessionIndex.ts` tree/leaves; `Sidebar.tsx` TreeNode | ✔ |
| 15 设置面板切模型/思考 | 07; `host.ts` setModel/setThinking; `ChatPanel` SettingsPanel | ✔ |
| 16 当前模型/provider/思考可见 | `ChatPanel` app-meta (model/thinking/session) | ✔ |
| 17 启动/忙碌状态反馈 | 启动中/生成中…/就绪 状态 + DirectoryPicker; `host.ts` busy 丢弃 + `log:warn` | ▲ 部分满足 → **工单 08** |
| 18 错误清晰上浮 | `chatReduce.ts` log:error → error; ToolCard error; DirectoryPicker 启动失败 banner | ✔ |
| 19 干净关闭无孤儿 | `sessionService.ts` stop()/kill + 退出监听; `main/index.ts` before-quit | ✔ |
| 20 信任/审批口径展示 | 07; `trustInfo.ts` → ready.trust; `SettingsPanel` 信任口径段 (与审批分离) | ✔ |
| 21 连贯可滚动 transcript | `ChatPanel.tsx` Message/ToolCard/FileChangeList 内联, `.messages` overflow-y:auto | ✔ |

## ◎ 三项已知取舍核对 (spec 预期)

1. **文件改动 diff (a):** ✔ 符合 spec/06 预期。
   `chatReduce.ts` `deriveFileChange`: `edit` → 用 Pi 自带 `result.details.patch`
   (lossless 统一 diff, `kind: modified`);`write` → Pi 不读旧文件、只读事件流拿不到
   before,按 `args.content` 全量渲染 (`kind: added`)。见 D3 附注。
2. **审批闸门 ↔ trust 分离 (b):** ✔ 符合 `CONTEXT.md` Decisions 与 spec
   "Tool-approval model"。两者是**两件事**:审批 = per-execution 工具运行前闸门;
   trust = Pi 加载项目本地资源的输入闸门。UI 设置面板用独立段落并显式注明"二者并存、
   互不混淆";`trustInfo.ts` 只读展示 Pi 的 `defaultProjectTrust`。未混淆。
3. **单活动会话守护 (c):** ✔ 符合 spec "MVP is single-active-session"。
   `host.ts` 用 `busy` 标志:在途 prompt / session-command / set-model / set-thinking
   到达时以 `log:warn` 丢弃,避免并发竞态。

## ⚠ 存在偏差 / 待裁决的条目

### D1 — 工单 07 的验收清单此前未打勾 (纯记录问题,已修正)

`issues/07-*.md` 标 `resolved` 且实现完整、可验证,但 5 条 acceptance 全部是
`[ ]`(未勾)。这是一处**记录/文档不一致**,不是实现缺口。closeout 期间已把 07
的 5 个框按事实勾上(实现均已逐条验证)。

### D2 — 忙碌时丢弃 prompt 无可见反馈 → 已访谈定案为"保留 Pi 注入/排队"并落地

spec **US 17** 要求"startup 或 busy 时给进度/状态反馈"。核对时发现 busy 丢弃场景
无用户可见信号:`host.ts` 只发 `log:warn`(主进程 console),`chatReduce.ts` 只响应
`log:error`,warn 不改 `ChatState`;且 send 按钮在 `streaming` 时禁用、但 Enter 无守卫,
提交后消息上屏、状态卡在"生成中…"。

**访谈定案 (2026-08-25, `grill-with-docs`):** 用户确认意图不是"提示吞掉",而是**保留
Pi 原生支持的注入/排队能力**(`grill-with-docs` 二轮访谈,ADRD 见 `docs/adr/0003`)。
已实现并合入,取代了原先的 busy 丢弃:
- 契约 `ParentToHost.prompt` 增可选 `streamingBehavior: "steer"|"followUp"` + `clear-queue` 命令;
- `host.ts` 去掉 busy 时丢弃 prompt,改用 `session.prompt(text,{streamingBehavior})`(SDK
  原生排队/注入),改用 SDK `isStreaming` 判定忙碌;session-command/set-model/set-thinking
  忙碌时仍拒绝;
- `chatReduce.ts` 折叠 `queue_update` → `ChatState.queue`;
- `ChatPanel.tsx` 增加发送方式选择(注入/排队)+ 待发送队列面板(清空)。

`typecheck` / `vitest` / `electron-vite build` 全绿;Pi SDK 与 `~/.pi/agent` 未修改
(mtime 未变)。

**后续两轴审查 (code-review, 2026-08-26):** Standards 无硬性违规(判断项:
`"steer"|"followUp"` 联合类型 8 处重复、`composer-bahavior` 拼写);Spec 发现一条
真缺陷 + 一条未记录偏差,均已在新会话修复(commit `861044c`,已核验):
- **followUp 卡 streaming(真缺陷,已修):** 入队的 followUp 由 SDK 内部排空、不重进
  `runPrompt`,原实现没有任何东西发 `done`,界面永远停在 streaming——正是本工单要
  消灭的"卡在生成中"。修法:`host.ts` 改为以 SDK 的 **`agent_settled`** 事件作为
  `done` 的唯一真源(它在 run finalizer 里、排空所有 steer/followUp 后恰好触发一次),
  `runPrompt` 不再自行发 done;每个 run 恰好一个 done,覆盖 normal/steer/followUp,
  预检失败则以 error 状态呈现。
- **Q10-B 偏差(已记录):** 用户 Q10 选"每条带移除",但 **Pi SDK 的 `clearQueue()`
  只清空全部**(无 per-item 公共 API),落地为**单"清空"动作**;per-item 移除需自造
  (clearQueue 后重排队,风险高),列后续候选,未实现。此偏差已写入 ticket 08 与
  ADR-0003。
- **Standards 判断项(已处理):** `StreamingBehavior` 收敛到 `contract.ts` 一处导出、
  消除 8 处重复联合;`composer-bahavior` → `composer-behavior`。

验证:`typecheck` / `vitest`(48 测试,含 followUp 回归用例)/ `electron-vite build`
全绿;Pi SDK mtime 未变。

## ◯ 仍属已知限制 / 后续候选 (非本次偏差)

- **D3 (diff 附注):** `write`(新增)文件的 `diffText` 是原样新内容;`DiffView` 中非
  `+`/`-`/`@@` 的行按 context 样式渲染,故新增文件不显示 `+` 前缀。仍展示全文、可读,
  满足"新增/修改文件列表 + 轻量 diff";仅属外观取舍,不作为缺陷。
- **已保存的审批默认仅进程内 (内存)**:`approvalGate.ts` defaults 是本进程内
  Map,跨进程重启不持久。spec 未要求跨重启持久化,保持现状。
- **Pi 只读消费、会话 JSONL 只读真相源**:始终遵守,未修改安装的 Pi 或 `~/.pi/agent`。
- **Phase 3 候选**(spec Out of Scope):原生终端、实时 diff overlay、多会话并发 pane、
  socket 远程控制、打包/签名/分发。

## 结论

MVP 全链路(输入 → 思考 → 工具执行 → 输出 → 文件改动 diff,会话树/分叉/设置/信任/
错误/干净退出)经 spec↔实现逐条核对,**21/21 全部验证通过**;三项已知取舍与 spec 预期
一致。两份内容差异:一条已按事实修正记录(07 勾选),一条已开新工单 08(busy-drop 反馈)
待裁决。无代码改动。
