# 26: 侧栏文件浏览器——「查看文件」

**What to build:** 分组悬停钮「查看文件」（票 19 的悬停框架中加入第三钮）→ **整个侧栏切换为该项目文件浏览器**：顶部「← 返回任务」按钮 + 项目名标题栏 + 文件树（目录/文件、类型图标、含 `.git`/`.idea` 等隐藏条目，与 ZCode 一致）；点击文件 → File Preview 标签打开（复用既有 preview 通道）。「返回任务」恢复任务列表。文件搜索框**后置 1.1**。

**背景（取证）：** ZCode 实测点击「查看文件」后的完整形态（`vf2.png`：返回任务 + 搜索 + 标题栏 + 文件树）；grilling R4-Q4 选 A（对齐 ZCode 形态，搜索后置）。

**Blocked by:** 19（悬停框架与按钮槽位）。

**Status:** ready-for-human

- [ ] 悬停钮加入第三枚「查看文件」；点击切换侧栏为文件浏览器
- [ ] 文件树按目录懒加载（复用既有目录读取通道；隐藏条目与类型图标对照 ZCode `vf2.png`）
- [ ] 「← 返回任务」一键恢复任务列表（浏览器状态不残留）
- [ ] 点击文件 → File Preview 打开对应路径
- [ ] smoke/visual 更新（浏览器态截图归档）；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (/to-tickets 重切): 自票 19 拆出（R4-Q4 选 A 对齐 ZCode；搜索后置 1.1）。取证实拍 `vf2.png`。
- 2026-09-01 (implement session, t26): 实现于 `69b47ae`，Status → ready-for-human。要点：
  - **纯缝**：`shared/file-browser.ts`（Seam-1，表驱动 vitest 14 例）——`openBrowser`/`fileBrowserReducer`（toggle/retry/children-loaded/children-failed/close）+ `browserRows` 拍平投影 + `fileIconKind` 类型词汇表。树是通道序的投影（dirs-first alphabetical 由 preview 通道保证），不做二次排序权威；`close` 归 null 由测试钉死「浏览器状态不残留」（组件侧 back = 卸载，双保险）。
  - **通道复用**：目录懒加载走既有 `preview:load`（ticket 07 目录读取通道，零新契约）：根以 `'.'` 发送、首次展开才拉取、已加载子树缓存复用、requested-set 防重复在途请求、失败留 `retry` 一键重拉。隐藏条目（`.git`/`.idea`/`.gitignore`）按通道原样列出（无过滤，对齐 ZCode）。
  - **悬停第三钮**：票 19 框架的中间槽位 `⋯ / 查看文件 / ⊕`（findings 行 16 的 ZCode 三钮序），tooltip 用票 22 组件（「View files」短描述态）。点击 `browserTarget` 置位 → 侧栏整体换装：`← Back to tasks` + 项目名标题栏 + 文件树；账户栏保留为侧栏常驻 chrome。文件点击 → 既有 `openPreview` 深链侧面板 File Preview（m9c 取证：浏览器 + 预览同框）。
  - **类型图标**：folder/git/config(braces)/docs/image/style/code/file 八类按扩展名映射，色相对照 ZCode（m9b 图标签名 folders=4/code=2/git=1）。空目录、加载中、读取失败均有行内提示（失败可点击重试）——失败面是超验收的少量披露（不可读目录的优雅降级）。
  - **visual:multi 扩展**：`ensureVisualProjectFixture`（tmpdir 隔离真实 fixture 目录，basename 保持 api-server 使 m3–m7 探针不变）+ m9a–m9d 四帧（根列表含隐藏条目 / src 懒加载展开 / README.md 预览深链 / 返回恢复任务列表），全部 DOM 探针门禁后真鼠标事件截图，归档 `.scratch/compare/m9*.png`。重跑验证 m3 现为三钮形态。
  - **验证**：typecheck / lint / vitest 634 全绿（新增 14 例）。smoke 未扩新阶段（无新契约事件，理由同票 19）；全量 smoke 含真实模型调用受 dev-app 串行约束，留待合并会话/操作者按惯例执行。
  - **披露**：① `vf2.png` 未在 `.scratch/compare/` 归档（取证链缺帧），形态依据 findings 行 16 三钮实拍 + grilling R4-Q4 决议 A 构建，操作者可补帧；② 浏览器态保留底部账户栏（ZCode 形态证据未覆盖此细节，判定为侧栏常驻 chrome）；③ 失败/空目录行内提示为超验收最小面。合并：请操作者执行 `bash scripts/merge-ticket.sh 26`。
