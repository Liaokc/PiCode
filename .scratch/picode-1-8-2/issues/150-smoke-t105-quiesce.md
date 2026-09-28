# 150: smoke:electron t105 trusted-keystroke 腿 harness 加固——后台会话流静默等待 + echo 轮询扩窗

**Status:** ready-for-human
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

- [x] t105 腿加固在案：按键前静默等待 + echo 轮询扩窗；断言文本与 3-attempt 结构逐字不变；仅 smoke 路径（不触碰产品面）（另：经操作者批准的 echo 探测谓词修复——真因为右侧提示行长恒定致旧谓词确定性失明，详见 Comments 取证；断言语义保留且更严）
- [x] `npm run smoke:electron` 全套 PASS（t105 + MCP 段 16 断言 + OAuth 双腿全绿；dev-app serialization 纪律照旧：ps 自查 + sleep 60 重试上限 30 分钟）
- [x] vitest 全绿（`env -u PI_SUBAGENT_CHILD -u PI_SUBAGENTS_HERDR_BRIDGE -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`）/ typecheck ×2 / eslint touched
- [x] 除 `src/main/smoke.ts` 外零源码改动
- [x] T149 MCP 段 2.38.0 app 级证据补齐记录（绿跑日志引用，含 keyring bump OAuth 双腿实测结论）

## Comments

- 2026-09-27（执行会话立票）：操作者裁决 1(a)+2(i) 并明令「2(i)开票然后修复」。本票为 T149 smoke:electron t105 阻断的 harness 修复后续票；T149 已按证据式闭环（1.8.1 EV-0029 先例）处理，本票修复合入后收尾门全套重跑（期望全绿；若修复不 hold，收尾门回退 2(i) 证据闭环）。
- 2026-09-28（实现 + 取证修正 + 全套验证；smoke.ts 单文件，待评审）：
  - **真因取证（修正 T149 机制误判）**：三次插桩运行（/tmp/t150-smoke-electron.log、/tmp/t150-diag-run.log、/tmp/t150-diag-run2.log）实证 t105 失败**与渲染饱和/时序无关，是 echo 探测谓词的确定性失明**：①keystroke tap 实捕 pty 对 'z' 的回显字节（fish 语法高亮重绘 `\u001b[38;2;204;102;102mz` + 右侧提示重绘）——keyDown→pty→echo 全链路健康；②fresh bridge pty（同 preload IPC 路径新起 shell）echo 正常；③rows 实有 zzz——三次按键全部回显成功，shell 活着、焦点在 xterm textarea、无 restart strip；④精确数字：before len=371 zcount=1 → 三次 attempt 后 len=371 zcount=2/3/4——行长恒定，z 计数递增。**机制**：操作者 fish 提示符带右侧提示（`(base)` conda 标记）——每敲一字符左侧增长 1 列、右提示前填充缩 1 列，行 textContent 长度不变，`rowsText.length > before.length` 永假。解释：Sep 24 全绿（彼时无右侧提示）vs Sep 27 起 8/8 确定性失败（含 T149 干净 base A/B）vs smoke:pty 绿（裸字节匹配不用行长启发式）。T149「renderer 饱和」理论证伪：recent-events 环是 last-40 无时间戳，T149 所见 thinking_delta 环数据实为 bg 阶段数分钟前的陈旧流（bg stage 的 deny 回合在 keymap 前已 agent_end）。环境变化 = conda/提示符（待操作者确认），非模型流。
  - **修复（两件，均仅 smoke 路径，断言文本逐字不动、3-attempt 结构不动）**：①票面时序加固照实：按键前静默门（轮询 noteEvent 同源时间戳流，连续 ~500ms 无新会话事件才放行第一个 keystroke，上限 ~120s 超限尽力而为）+ echo 轮询窗 1.5s→~10s/attempt（防御性时序余量，t135/t141 harness-rider 同型）；②**经操作者（supervisor 通道）批准的谓词修复**：echo 探测 `rowsText.length > before.length && rowsText.includes('z')` → z 计数增长 `rowsText.split('z').length > beforeZs`（快照时捕获）——断言语义保留且更严（必须出现一个【新的】'z'；旧 includes('z') 可被提示符自带 'z' 满足），对恒定行长免疫。同型排查：t105 是全套唯一终端 rows 探测点，无同型兄弟。注：时序加固单独无法变绿（行长永不变），谓词修复才是解锁项。
  - **验证（全绿）**：`npm run smoke:electron` 全套 PASS（SMOKE start → SMOKE done，零 FAIL；t105 七标记全绿含 `terminal_focus_105_typing_ok`；其后 t132/MCP 段全过）——**T149 残余风险补齐：MCP 段 16 断言全绿**（mcp_section_open / add_global / layer_entries / cards_badges / enable_flag / disable_flag / edit_global / remove / status_projection / status_live_update / status_lazy_untouched / external_zero_write / credentials_zero_leak / oauth_autocomplete / paste_dialog / oauth_manual_paste）**含 OAuth 双腿**（自动腿 `mcp_oauth_autocomplete_ok` + 手动粘贴腿 `mcp_oauth_manual_paste_ok`）——即 `@napi-rs/keyring` ^1.3.0→^2.1.0 major bump 的 macOS keychain 实测通过（T149 调研 §4-f / 残余风险闭环：系统浏览器 → localhost 回调自动完成 + 手动粘贴兑底两路均绿，凭据全程只在 adapter/钥匙串）。vitest 2193/2193（env -u 纪律）、typecheck ×2、eslint touched 零问题；除 src/main/smoke.ts 外零源码改动（树净，无 package-lock 噪声）。绿跑日志：/tmp/t150-smoke-electron-final.log；取证插桩日志：/tmp/t150-diag-run.log、/tmp/t150-diag-run2.log。
- 2026-09-28（双轴评审，双 pass-with-notes，零 blocker）：
  - Spec 轴（review-spec）：pass-with-notes——处方①②③逐项 ✓（静默门 smoke.ts:451-454/4220-4223、echo 轮询 10s :4269、断言文本 base↔branch diff 为空，`the trusted keystroke never echoed in the shell` 逐字在案）；红线 ✓（仅 smoke.ts+票面；sibling 独立验证：xterm-rows/rowsText 仅 t105 腿，无第二处行增长启发式）；证据 ✓（/tmp/t150-smoke-electron-final.log L96 start→L816 done 0 FAIL；t105 七标记 L229-236；MCP 16 断言 L593-638 + OAuth 双腿 L621/L635）；取证忠实 ✓（diag-run2 L231-236：len=371 恒定 zcount 1→2→3→4、pty 回显字节、(base) 右提示、last-40 无时间戳环——T149 饱和理论证伪佐证）；谓词变更 = supervisor 批准 + 票面 Acceptance①/Comments/提交 body 三处披露；诊断插桩已全数移除。Notes（非阻断）：①final.log L369-373 既有 tripwire timeout warning（base 同码、未致 FAIL、套件照常 done）；②vitest/typecheck/eslint 声明与提交 body 一致无反证。
  - Standards 轴（review-standards）：pass-with-notes，零 blocker——核实项全过（z-count 谓词语义正确 `split('z').length`=z数+1、快照时点在静默门后按键前；lastEventAt 与 recentEvents 同流同点更新；fail 文本与 3-attempt 逐字未动；仅 smoke 路径；t105 全套唯一 rows 探测点；提交惯例合 149 先例）。Non-blockers（判断性）：①t135 rider 注释首句 "~1.5s" 现在时与 :4271 的 10_000 相悖，下次触碰宜改过去时；②同腿三个 inline sleep-poll 循环 Duplicated Code（repo 惯例优先仅记录）；③静默门在真因证实后属 Speculative Generality 边缘（票面明令保留、有界、注释自辩）；④票面 acceptance 第 1 项原位加注（谓词修复）——Linear 描述同步该 work-content change；⑤Status 未落 claimed 直跳 ready-for-human（与 T149 先例一致，claimed 由 LIA-215 In Progress 承载）。
- 2026-09-28（验证记录 + 合并）：smoke:electron 全套 PASS（/tmp/t150-smoke-electron-final.log：SMOKE start→done 0 FAIL；t105 七标记；MCP 段 16 断言 + OAuth 自动腿/手动粘贴腿绿——T149 残余风险闭环，@napi-rs/keyring ^1.3.0→^2.1.0 macOS keychain 实测完成）；vitest 2193/2193；typecheck ×2；eslint touched 零问题。合并：merge 54c914c（源 15c2c49，rebase 自 78704b9；cdcce2f 票面内容经 02d8366 先行落 main，rebase 跳过重复补丁）；merge 后 main typecheck + vitest 全绿。
