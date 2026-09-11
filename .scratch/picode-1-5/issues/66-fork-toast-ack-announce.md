# 66: 基座 visual harness fork-toast ACK 修复——fork 后补发新 id 的 session_created 公告

**What to build:** 基座 `npm run visual:transcript` 的 2d 段恢复 PASS：fork 点击后由 harness（visual.ts 内，合同流注入）补发一条**新 id** 的 `session_created` 公告，让票 51 的 ACK 链路（toast 仅在「被 fork 出的新 id 的公告到达」时触发）如真实 live host 一样兑现——app/renderer/契约零改动。因公告会把视图焦点切到空的 fork 会话（注册表 `applyAnnouncement` 语义：announcement = "now looking at it"），fork 段** relocates 到 3-expanded 密度帧之后、ticket-14 replay 公告之前**，使 2e/3 等后续帧不受焦点切换影响；其后紧邻的 ticket-14 replay 本就重新 `session_created(visual-replay, resumed)`，焦点自然回到既定轨道。**app/renderer/契约零改动（票 51 ACK 语义原样）**；与在途票零文件交集（仅 src/main/visual.ts 基座段，additive 纪律）。零契约增量。

**背景（取证）：** ① 现状：2d 段（visual.ts L495–512）点击消息操作行 fork 钮后断言 toast 含 "Forked"，实际 toast 为 "This session has no live host…"（fork 命令发给无 host 的 synthetic 会话 → `session_command_error`）→ 段失败。② 根因：票 51 ACK 化——`App.tsx L311–318`：toast 仅当 `session_created` 的 scopeId ≠ `forkAckRef.current`（fork 目标 id）时触发（公告 id 恒为新 id）；synthetic 会话无 live host，公告永不到达 → ACK 永不兑现。③ 非新回归：58 会话已 stash 复测干净 HEAD 同样失败。④ **本票自行核实的追加事实**：(a) `handleFork`（App.tsx L1033–1038）置 `forkAckRef.current = focusedIdRef.current`（= 'visual-session'）后发 `fork_session`；host 侧 `fork_session` → `handleFork`（host/index.ts:681）在无 runtime 时即报错；(b) **公告会切焦点**：注册表 `applyAnnouncement`（session-registry.ts L169–183）设 `focusedId = 新 id` 且 chat 状态重置——若 fork 段留在原位，紧随的 2e（jump 按钮，需要 visual-session 的溢出转录）与 3-expanded（密度帧）将拍到空会话而破坏；(c) **侧栏不受影响**：侧栏行 = 索引服务磁盘扫描（SidebarProps.sessions ← sessions.list()），合成的无文件公告不产生新行——注入新 id 不破坏侧栏确定性布景（种子布景 visual-tui-live 走 writeVisualSession 磁盘种子，两不相干）；(d) 修复后 toast 等待清场逻辑（L518–527）随段迁移，2e 的既有注释（"The 2d toast must clear first"）同步前移；(e) fork 段迁移后帧序不变（帧名 2d 保留，仅执行位次后移），其余帧零改动零重拍——2d 帧内容与此前 PASS 时一致（toast 卡片），无需重录入册（既有 2d-fork-toast.png 即期望形态）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] fork 段注入：点击 fork 后 emit 一条 `session_created`，**新 id**（不复用被 fork 会话 id 'visual-session'、不伪造任何已存在 id——建议 `visual-forked` 类命名 + 注释说明「公告 id 恒为新 id，票 51 ACK 语义」）；cwd/model 字段与既有合成公告同风格（真实 tmpdir 纪律沿 visual.ts 既有分支）
- [ ] 段位次调整：fork 点击 + toast 断言 + toast 清场等待 relocates 到 3-expanded 密度帧捕获之后、ticket-14 replay 公告之前——2e/3-expanded 帧在未切焦点的 settled 转录上拍摄，内容与既有 PASS 形态一致；帧名 2d 保留
- [ ] ACK 兑现断言：2d 捕获的 toast 文本含 "Forked"（恢复 PASS）；并断言注入后焦点切至新 id（fork 的真实行为——自动会话切换）后、ticket-14 replay 公告把焦点带回既定轨道
- [ ] **零契约增量、零 app/renderer 改动**：diff 仅 src/main/visual.ts（基座段）；票 51 ACK 语义原样（App.tsx forkAckRef 链路不动）
- [ ] 侧栏确定性布景不破坏：注入的公告不产生新侧栏行（合成会话无磁盘文件，索引进不出）——electron 层面验证或注释论证留痕
- [ ] `npm run visual:transcript` 全链跑通：2d 恢复 PASS 且 2e/3-expanded/3b-replayed/…/8-tooltip 全段零回归；产物帧按需入库（2d 帧重拍入库，其余帧零变化不重拍）
- [ ] ps 复核铁律：跑 visual:transcript 前复核无其他 PiCode Electron/dev-app/smoke 进程（dev-app serialization）
- [ ] typecheck / lint / vitest 全绿

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 66`。

## Comments

- 2026-09-11 (requirements intake): 立票（操作者指令；背景取证由 58 会话 + 合并会话完成，本票自行复核行号：App.tsx L283–322 session_created/ACK 链、L1033–1038 handleFork、session-registry.ts L169–183 applyAnnouncement 焦点切换、visual.ts L495–560 2d/2e 段与 L561 ticket-14 replay 衔接、host/index.ts L681 fork_session）。**段位次调整是本票核实的追加结论**：公告切焦点 + chat 重置语义（ADR-0006 注册表）使「原地注入」会破坏 2e/3 帧——迁移到密度帧之后是最小扰动修法。术语纪律：不新增 CONTEXT.md 词条（「ACK toast」沿用票 51 既有表述）。零契约增量；与在途票零文件交集（仅 src/main/visual.ts，additive 纪律——smoke.ts 追加段先例同款）。
