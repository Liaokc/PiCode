# 08: 终端 PTY + 桥接

**What to build:** Side Panel 的 Terminal 标签为完整交互式伪终端（xterm + node-pty）：用户自跑命令、独立 shell 会话、resize 重排、与应用观感一致的主题。**Bridge**：agent 正在执行的 bash 工具命令及其输出单向投屏进终端视图实时可见，用户输入绝不回注该执行流。

**Blocked by:** 06 面板容器 + Review 标签。

**Status:** ready-for-human

- [x] 日常命令使用顺畅：滚动不花屏、resize 重排正确、进程退出干净
- [x] agent 执行 bash 时投屏区实时出现命令与输出；结束状态清晰
- [x] 用户在终端的输入永不进入 agent 工具执行流
- [x] fake-pty 缝测试覆盖投屏/resize/退出；真 PTY 冒烟脚本一条

## Comments

- 2026-08-28: implemented on `t08-terminal-bridge`, head `0ed3538` (1 commit since `main` @ `3a494d8`). Serialization rules respected (single Electron runner; no other dev app/smoke in flight).
- Seam-3 first: `src/shared/terminal/pty.ts` (minimal PtyHandle/PtyFactory contracts), `src/shared/terminal/terminal-session.ts` (controller: projection, input relay, validated resize, exit frames + restart, lifecycle notifications), `src/shared/bridge/projector.ts` (pure HostToParent → display-frame folder). All covered by fake-pty byte-replay tests — projection, input relay, resize bounds, clean/unclean exit, restart, service batching (16ms coalesce), interleaved calls, mid-run attach, interrupted settle on `agent_end`/`turn_error`/`session_created`/`host_exit`.
- One-way guarantee is structural: the projector consumes contract events and emits write-only frames; the bridge xterm is `disableStdin` with NO `onData` wiring, so no code path exists from keystrokes to any execution stream. `tests/terminal/pty-guardrail.test.ts` confines node-pty to the main-process factory (`src/main/terminal/node-pty-factory.ts`) + the one smoke script.
- Main process: `TerminalService` owns ptys and coalesces output per 16ms tick onto terminal-dedicated IPC channels (`terminal:data`/`terminal:exit`), per ADR-0004 (never the per-event JSON contract stream); input/resize/kill channels validate types; `disposeAll()` on app quit (no orphan shells). Bridge traffic rides the existing contract `tool_update` stream in-renderer (no new per-chunk IPC).
- Renderer: `TerminalTab.tsx` — top Agent Bridge pane (status chip idle/agent-running, placeholder until first frames) over the user's interactive shell pane; ResizeObserver → FitAddon → pty resize; exit status strip with Restart; light-theme xterm palette in `src/renderer/src/terminal/theme.ts` keyed to app tokens. `SidePanel` now keeps open tabs mounted while hidden and overlays the tab picker — switching tabs no longer kills the live shell (ticket-06 behavior would have).
- Real-PTY smoke (the only real pty outside the factory): `npm run smoke:pty` — spawn `$SHELL --login` → echo marker → resize → second echo → clean exit 0. Verified passing (fish 4). `postinstall` chmod restores node-pty's `spawn-helper` exec bit that npm strips (else `posix_spawnp failed`).
- Terminal visual harness: `PICODE_VISUAL=1 PICODE_VISUAL_TERMINAL=1 VITE_PICODE_PANEL_OPEN=1` (build with the VITE flag baked) captures `.scratch/visual/terminal-{1,2,3}.png`: bridge mid-run + settled end states over a live fish prompt, and a typed `echo PICODE_TYPED_OK` round-trip proving the input path end to end. The harness caught a real bug pre-commit (xterm onData → pty input was unwired; fish's DA-query warning exposed it).
- Review (both axes, self-run — no sub-agent tooling in this session): Standards — file headers/ADR references/English copy/type-only imports conform; no documented-standard violations; judgement-call notes only (visual.ts alias re-exports kept for the chat flow; IPC `terminal:start` takes flat args matching the existing bridge style). Spec — all four acceptance boxes exercised; scope additions (picker overlay, mounted hidden tabs) are required consequences of a live shell and are documented in code.
- Verification: 287 vitest tests green (30 files), `typecheck` + `eslint` + `electron-vite build` clean, `smoke:pty` green.
- Human pass remaining: `npm run dev` → run a real task with bash tool calls while typing in the Terminal tab; check scrollback/resize behavior against personal taste, and the restart affordance after `exit`.
- Merge from the root worktree: `cd ~/PiCode && git merge --no-ff t08-terminal-bridge`.
