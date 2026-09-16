# 80: New Task 权限链补全——accessPick + 会话默认值增量

**What to build:** New Task 空态的权限选择真正生效（对照操作者痛点：菜单能点开、选择无反应）：EmptyState 增 **accessPick 本地态**（权限菜单 onPick 覆写为本地 set——chip 即时反映所选，对照票 41 的 model/thinking pick 链）；随任务创建参数下传、创建的会话以该档位运行；未选 = Pi fallback + "**default**" 小标（modelIsDefault 先例）；**跨重启不持久**（与 model/thinking pick 同型）。**additive 契约增量**：会话默认值结构增 `accessMode?` 字段（创建载荷携带；旧载荷缺字段照常校验通过）。

**背景（取证）：** EmptyState 只覆写了 model/thinking 两个 onPick，权限 onPick 透传到 sendFocused——New Task 无 host 时命令**静默丢弃**（票 41 补链漏项）；会话默认值结构无 accessMode 字段。file:line 级根因见 `../intake-grilling.md` R6 节。

**Blocked by:** 74（R6 与 R13 同改 EmptyState——文件冲突规避边；74 先落）.

**Status:** ready-for-human

## Comments

- 2026-09-15（implement session，t80-access-chain）：补成票 41 同型 pick 链。① EmptyState 增 `accessPick` 本地态（`useState<AccessMode | null>`，`onSetAccessMode` 覆写为本地 set——原透传 `sendFocused` 在 New Task 无 host 时静默丢弃，即根因）；`chat.accessMode = accessPick ?? DEFAULT_ACCESS_MODE`（门自己的 fallback 'standard'）+ `accessIsDefault: accessPick === null`；未选 = fallback + "default" 小标（ComposerChat 新增 `accessIsDefault?` 字段，access chip 渲染与 model/thinking 同型；会话内永不为 chip 打标）。② `NewTaskModelChoice` 增 `accessMode: AccessMode | null`（renderer 内部类型，与 model/thinking 同 required-with-null 风格），`mergeNewTaskDefaults` 并入 `SessionDefaults.accessMode?`。③ host：`session-args` 增量字段入账——`hasSessionDefaults` 计入 accessMode（仅 accessMode 的 defaults 也走 sentinel）、`parseSessionArgs` 对 junk accessMode 防御性丢弃（词表校验，旧载荷缺字段照常通过）；host/index `newSessionAccessMode()`（与 `newSessionSeedOptions` 同 guard：仅新会话、resume 永不收 defaults）在 seed 消费处 `gate.setMode`（SDK 无 access-mode 会话选项——档位是 PiCode 自有 gate 概念），`composer_state` 携 `gate.getMode()` 自然投影回会话 chip。④ 跨重启不持久 = 结构性（组件 useState、零偏好写入）+ electron smoke 运行时实证（重启代理后 chip 回退带 default 小标）。

**Seam 测试（RED→GREEN 实证）：** `tests/main/session-args.test.ts` +3（accessMode-only sentinel 往返 / 旧载荷无 accessMode 原样通过 / junk accessMode 丢弃保余）；`tests/shared/new-task-models.test.ts` +2（access pick 入 defaults / 未选时 accessMode 保持缺席——旧载荷形态）+ 既有字面量补 accessMode。先行 RED（3 挂）后实现转 GREEN。

**报备入账（additive 契约增量）：** `SessionDefaults.accessMode?: AccessMode`（`create_session` 载荷 + spawn sentinel；旧载荷缺字段照常校验通过）——`scripts/smoke/host-contract-smoke.mjs` Round E/E2 报备（rebase 后编号顺延票 71 的 Round D）：E = 旧形态 sentinel（ticket-11 字段、无 accessMode）→ `composer_state.accessMode` 保持门 fallback 'standard'（旧载荷兼容 + fallback 完好）；E2 = `{accessMode:'read-only'}` sentinel → `composer_state.accessMode === 'read-only'`（零 set_access_mode 命令）。其余零契约（UI 字段 `accessIsDefault` 仅 renderer 内部）。

**electron smoke（`src/main/smoke.ts`）：** 空态 stage ④b：未选 access chip = 'Access mode: Standard' + default 小标（`empty_state_access_default_ok`）→ 菜单点 Read Only → chip 即显且小标消失（`empty_state_access_pick_ok`）→ 发送创建 → `composer_state.accessMode === 'read-only'`（`empty_state_access_rides_ok`）+ 会话视图 chip 投影（`empty_state_access_session_chip_ok`）→ 恢复 standard 不扰后续 stage（`empty_state_access_restore_ok`）。跨重启：票 74 重启代理处借点——重启前空态点 Read Only（`access_pick_before_restart_ok`），reload 后 boot 空态 chip 回 Standard + default 小标（`access_pick_restart_reset_ok`）。

**验证记录：** typecheck ✓；vitest 94 文件/1440 测试（rebase 后含票 71/78 新测试）✓；eslint 本票文件清（EmptyState react-hooks warning 为票 41 预存在，stash 对照确认）；host-contract smoke PASS（含票 71 Round D + 本票 Round E/E2）✓；electron smoke 全套 PASS（exit 0、SMOKE done，含票 78 turn-filebar stage）✓。跑前 `ps` 自查均执行。注：rebase 期间两次 smoke 失败均环境干扰非本票代码——一次 ticket-76 provider 定位断言（checked≠selected，光标 hover 打进菜单高亮行）、一次票 25 deny reason 尾贴 'sl' 两字符（autoFocus 的 pill 输入捕获物理按键）；复跑即绿，两次失败 stage 均与本票改动无交集。审查：双轴（Standards/Spec）自检通过——增量契约唯一（SessionDefaults.accessMode?，旧载荷兼容已锁）、无范围蔓延、CONTEXT.md 术语一致（access tier / approval gate，不用「权限」）。

**实现文件：** `src/shared/preferences.ts`（SessionDefaults.accessMode?）· `src/shared/new-task-models.ts`（choice.accessMode + merge）· `src/host/session-args.ts`（hasSessionDefaults + 词表防御）· `src/host/index.ts`（newSessionAccessMode + gate.setMode）· `src/renderer/src/components/EmptyState.tsx`（accessPick 本地态 + chat 投影）· `src/renderer/src/components/Composer.tsx`（accessIsDefault? + default 小标）· `src/renderer/src/App.tsx`（startTask 默认参补 accessMode: null）· 测试两文件 · smoke 两脚本。

- [x] Seam-1 会话默认值增量（accessMode 缺席兼容；有值时创建链路投影正确）——session-args +3 / new-task-models +2，RED→GREEN
- [x] host-contract smoke：`accessMode` additive 增量（旧载荷兼容）+ **实施时报备入账**——Round E（旧形态 sentinel → 'standard' fallback）/ E2（`{accessMode:'read-only'}` → 门即入档）双锁（rebase 后编号顺延票 71 的 D），报备见 Comments
- [x] electron smoke：New Task 选权限 → chip 即显 → 创建 → 会话 chip 与首回合档位正确；未选显 default 小标——`empty_state_access_default/pick/rides/session_chip/restore_ok` 全过
- [x] 跨重启不持久确认（与 model/thinking pick 同型）——结构性（useState 零持久化）+ 运行时实证：票 74 重启代理前后 `access_pick_before_restart_ok` / `access_pick_restart_reset_ok`
- [x] 纯 renderer + additive 契约；全英文文案——唯一契约增量 `SessionDefaults.accessMode?`（旧载荷兼容已锁）；新用户可见文案仅 "default" 小标（既有先例同款）
- [x] 跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）——每次 smoke 前检查，无并跑实例
