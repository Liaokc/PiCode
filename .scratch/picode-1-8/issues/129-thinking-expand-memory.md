# 129: thinking 行展开跨重挂载记忆——per-session 视图注册表

**What to build:** thinking 行展开态提升到 **per-session 视图注册表**（`shared/session-registry.ts` 视图状态扩展——`expandedTurns` 同层新增 `expandedThinking: ReadonlySet<entryId>`）：`ThinkingRow` 受控化（open 态由注册表驱动，toggle 落账）；**跨所有重挂载记忆**——设置跳转往返、会话切换往返、折叠往返全保留（Q5=B 裁决）；会话期内存级（重启回默认——与草稿同口径，不持久化）；**Worked 容器 `expandedTurns` 语义零改动**（1.6「容器展开跨切换不记忆」旧裁决维持——本票只动 thinking 行）。

**背景（取证）：** `ThinkingRow.tsx:23` `const [open, setOpen] = useState(false)` 组件本地态——设置跳转卸载工作区 → 重挂载全折叠（操作者实测：「agent 运行时点开了 thinking 容器，点击设置跳转…重新回来之后 thinking 容器又折叠了」）。对照：容器展开集合 `expandedTurns` 活在 registry（跨跳转存活）——`chat-reducer.ts:191` 其「跨切换不记忆」注释是票 56 时代对 Worked 容器的裁决，thinking 行按新裁决走（Q5=B）。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：expandedThinking 存取表驱动（toggle/落账/会话切换隔离——A 会话的展开不串 B 会话；entry 粒度键）
- [ ] electron smoke：展开 thinking 行 → 跳设置 → 返回仍展开；切会话 A→B→A 仍展开；重启回默认（新会话态验证）
- [ ] Worked 容器折叠/展开跨切换的既有行为零回退（票 56/82 语义）
- [ ] 性能红线：toggle 落账零额外渲染风暴（registry 派发单次）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P16 定稿为 R13。Q5=B（所有重挂载记忆）——1.6 旧裁决边界在票内明示（仅容器维持旧律）。
