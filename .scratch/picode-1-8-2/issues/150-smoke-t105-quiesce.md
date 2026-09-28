# 150: smoke:electron t105 trusted-keystroke 腿 harness 加固——后台会话流静默等待 + echo 轮询扩窗

**Status:** ready-for-agent
**Branch:** t150-smoke-t105-quiesce
**Blocked by:** —

## What to build

1. **t105 trusted-keystroke 腿 harness 加固**（`src/main/smoke.ts` t105 腿，~4186-4235；沿 ticket-135 harness rider 先例：**断言文本逐字不动、只改时序面、仅 smoke-mode 路径**）：
   - 按键探测前等待渲染静默：轮询 smoke 的会话事件流（fail dump 的 "recent events" 同源），直至连续 ~500ms 无新会话事件（后台会话 model 流结束 + renderer 队列排干）再发第一个 keystroke；等待上限 ~120s，超限则尽力而为继续（由扩窗轮询兜底）；
   - echo 轮询窗 1.5s/attempt → 扩至 ~10s/attempt（保持 3 attempts 结构）；
   - 全部既有断言文本（含 `the trusted keystroke never echoed in the shell`）逐字保留。
2. **验证：`npm run smoke:electron` 全套 PASS**（含 t105 腿 + 其后 MCP 段 16 断言 + OAuth 自动腿/手动粘贴腿）——顺带补齐 T149 因 t105 阻断未能实测的 MCP 段 2.38.0 app 级证据（含 `@napi-rs/keyring` ^1.3.0→^2.1.0 major bump 的 macOS keychain 实测，T149 残余风险调研 §4-f）。

## 背景（取证）

- T149 六跑取证（详见 `.scratch/picode-1-8-2/issues/149-mcp-238-fidelity.md` 披露 + `.scratch/picode-1-8-2/run-log.md`）：t105 可达即败 **5/5**（含两次操作者静默窗 + stash 干净 base A/B 逐字同败；base src 与 1.8.1 发版提交 14b5c88 字节相同）；menu_keyboard 偶发 1/6 复跑即过；`smoke:pty` EXIT=0（pty/shell/echo seam 健康；fish 装于 2025-12-17，早于 Sep 24 全绿证据）。
- 机制（run 6 fail log recent-events dump 实证）：smoke 自身后台会话（8828a5）的真实模型流（默认 GLM-5.3 重思考，29+ 条 thinking_delta）恰在 t105 按键探测期饱和 renderer 任务队列 → keyDown→pty→echo 往返超出 t135 时代缓解的 1.5s echo 轮询窗。smoke.ts 内 t135 harness rider 注释原文记载同类（"under suite load (the background session's model streams saturating the renderer's task queue) the keyDown → pty → echo round trip can land well past 80ms"，当年三连败后 80ms→1.5s）。
- Sep 24 全绿后环境变化候选 = smoke 默认模型/GLM-5.3 流型（待操作者确认；不阻塞本票——修复面向「任何后台流期间」的时序鲁棒性，不依赖具体模型）。

## Acceptance

- [ ] t105 腿加固在案：按键前静默等待 + echo 轮询扩窗；断言文本与 3-attempt 结构逐字不变；仅 smoke 路径（不触碰产品面）
- [ ] `npm run smoke:electron` 全套 PASS（t105 + MCP 段 16 断言 + OAuth 双腿全绿；dev-app serialization 纪律照旧：ps 自查 + sleep 60 重试上限 30 分钟）
- [ ] vitest 全绿（`env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`）/ typecheck ×2 / eslint touched
- [ ] 除 `src/main/smoke.ts` 外零源码改动
- [ ] T149 MCP 段 2.38.0 app 级证据补齐记录（绿跑日志引用，含 keyring bump OAuth 双腿实测结论）

## Comments

- 2026-09-27（执行会话立票）：操作者裁决 1(a)+2(i) 并明令「2(i)开票然后修复」。本票为 T149 smoke:electron t105 阻断的 harness 修复后续票；T149 已按证据式闭环（1.8.1 EV-0029 先例）处理，本票修复合入后收尾门全套重跑（期望全绿；若修复不 hold，收尾门回退 2(i) 证据闭环）。
