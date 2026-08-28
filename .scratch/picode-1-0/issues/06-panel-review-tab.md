# 06: 面板容器 + Review 标签

**What to build:** 右侧 Side Panel 框架：开合、多 tab、宽度拖拽；首个标签 Review——工作区 vs git HEAD 的全量差异视图：per-file diffstat、文件树、unified 默认、split 切换。只读呈现（不含提交/推送按钮）。空态对照截图 03 的"打开标签页"卡片构图（本产品仅 Review/Terminal 两卡）。

**Blocked by:** 02 Host 活体。

**Status:** ready-for-human

- [x] 面板开合/多 tab/拖宽手感自然，主区自适应不跳动
- [x] Review 差异内容与终端 `git diff` 输出语义一致；unified/split 即时切换
- [x] 千行级大 diff 滚动保持流畅
- [x] 空态两卡（Review/Terminal）构图对照截图 03 通过

## Comments

- 2026-08-28: implemented on `t06-panel-review`, head `465eb2f` (2 commits since `main` @ `24b7e1f`).
- Panel framework: `src/shared/panel-model.ts` pure reducer (open/close/activate tabs, picker, width drag 320–760px, double-click reset); `SidePanel.tsx` renders the tab strip (collapse chevron · tabs · “+”) per screenshot 08 and the screenshot-03 two-card picker (Review/Terminal, no browser). Terminal tab holds a placeholder until ticket 08.
- Review seam: pure pipeline in `src/shared/review/` — unified-diff parser (hunk-count-driven consumption, so deleted `--- a/x`-looking lines can't break file splitting), split-view alignment, file tree, fixed-row windowing math. Main-process collector `src/main/review/collect.ts` runs real `git rev-parse` / `git diff HEAD` / `git status -z`; untracked files are synthesized as whole-file additions; typed failures (`not-a-git-repo` / `git-unavailable` / `failed`). New `window.picode.review.load` invoke bridge; `src/shared/contract.ts` untouched (additive-only respected).
- Verification: 138 vitest tests green (18 files), incl. 6 collector tests against real git repos in tmpdirs (modify/add/delete/rename/binary/untracked/unborn-HEAD/clean), a 20k-line patch test pinning parse completeness + bounded render window (≤ viewport + 2×overscan rows at any scroll position), and panel/review reducer tables. `typecheck` + `eslint` + `electron-vite build` clean.
- Read-only by construction: no commit/push controls anywhere in the tab.
- Human pass remaining: `VITE_PICODE_PANEL_OPEN=1 npm run dev` → drag the width, add/close both tabs, pick a task with real changes and check unified/split switching and thousand-line scroll smoothness against a real repo; empty-state two-card composition对照 screenshot 03.
- Merge from the root worktree: `cd ~/PiCode && git merge --no-ff t06-panel-review`.
