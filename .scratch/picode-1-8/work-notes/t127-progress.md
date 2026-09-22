# t127-settings-entry-dedupe 进展

## 目标一句话
票 127：移除 TitleBar 齿轮设置入口（票 63 UI 面退役的收尾），保留 Sidebar 左下齿轮与 ⌘, 快捷键，并保证票 74 的草稿停靠联动不被入口删减破坏；UI 文案全英文。

## 事件记录

- [开工] 阶段=开工。已创建本文件；随后读票面/CONTEXT/spec R14 并补记要点。
- [取证] 票面确认：删 TitleBar.tsx:121-135 齿轮（票 63，toggle 语义）；Sidebar.tsx:1279-1281 底栏齿轮保留（onClick=onOpenSettings → dispatchShellParking('open-settings')）；⌘, = shared/keymap.ts:61（零改动）；layout-model 'toggle-settings'/'open-settings'/'back-to-workspace' reducer 不动（shared 契约 additive-only）。设置视图（App.tsx:1749 早退分支）不挂 Sidebar，TitleBar 在两视图都渲染。
- [取证] 全仓引用扫描结果：
  - smoke.ts:456（票 96 阶段）与 8699（票 65 阶段）用 `button[aria-label="Settings"]` = Sidebar 齿轮 → 不受影响；
  - smoke.ts:8870-8883（票 63 阶段 ②）用 `button[aria-label="Close settings"]` = TitleBar 齿轮 → 必须重写（改为：TitleBar 无齿轮断言 + ⌘, 关闭 + ⌘, 重开）；
  - 票 89 MCP 阶段（9620）用 ⌘, 开设置 → 不受影响；
  - 票 74 草稿阶段（11245+）只用 ⌘N/Escape/行点击，不碰齿轮 → 停靠联动语义不受影响；
  - visual-usage.ts:158 / visual-settings.ts:141 / visual-multisession.ts:408 均用 Sidebar 齿轮 → 不受影响；
  - `tb-btn-active` CSS 由 TraceTab 共享 → 保留；无 vitest 直接渲染 TitleBar。
- [方案] 最小改动集：① TitleBar.tsx 删齿轮块+GearIcon import+docstring 更新；② App.tsx dispatchShellParking 注释更新（去 TitleBar 齿轮提法，保留 'toggle-settings' 守卫——停靠语义零变化）；③ shared/layout-model.ts:104 注释去"titlebar gear"提法（纯注释，契约零改动）；④ smoke.ts 票 63 阶段 ② 重写（⓪ workspace 无齿轮断言 + ② settings 视图无齿轮断言 + ⌘, 关/开）。Sidebar/keymap/reducer/SettingsWindow 全不动。
- [实现] 四处编辑已落地（TitleBar.tsx / App.tsx / layout-model.ts / smoke.ts），详见 git diff。
- [验证] typecheck 全绿；`env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT npm test` → 117 文件 / 1970 用例全过。ps 自查无其他 electron/PiCode 进程（t123 的 smoke 已于 03:04 结束，仅剩被动日志监控进程），serialization 槽空闲后启动全量 electron smoke（后台 pid 13087，日志 /tmp/t127-electron-smoke.log）。
- [验证] electron smoke（/tmp/t127-electron-smoke.log）：票 63/127 设置阶段全绿 — settings_open_cmdcomma_ok（⌘, 开）、settings_close_cmdcomma_ok（⌘, 关，新腿）、settings_reopen_ok（⌘, 重开）、settings_esc_close_ok（Esc 关）、settings_open_sidebar_gear_ok（Sidebar 齿轮开，新腿）、settings_sidebar_gear_esc_ok（Esc 再关，新腿）；⓪/② 无 TitleBar 齿轮断言未触发 fail。后续 packages/settings_mcp 阶段亦全绿。
- [发现] 本次 run 在后续 ticket-90 阶段（子代理 Running 徽标翻转）超时 fail——与本案零代码路径交集；该阶段在 111-final 与 smoke10 两次历史 run 全绿；且 t123 的 smoke 于 03:22（本案 run 中途）并发启动，双 smoke 并跑导致争用，判定为环境争用 flake 而非本案回归。取证：/tmp/electron-smoke-111-final.log（0 FAIL 全绿）、/tmp/t127-electron-smoke.log（本案）。
- [提交] 02e1c33（t127-settings-entry）＝实现提交：TitleBar.tsx / App.tsx / layout-model.ts / smoke.ts + 票面 Status→claimed。
- [阶段] 实现完成、双轴自审完成、实现已提交；待：视觉帧截图（需等 t123 smoke 让出 serialization 槽）→ 票面终态翻转（ready-for-human + tip sha）。
- [截图] 等 t123 smoke 结束（ps 轮询 ~3 次让槽）后跑 npm run visual:transcript 成功；新 build 帧存 .scratch/visual/（工作树）。跟踪帧为票 90 期归档（1x 尺度 ~88KB），本次全量重写为 2x retina（~204KB）——按 ce90e42 先例（意外全量重写→恢复归档）执行 git checkout 恢复，零二进制 churn；证据帧另存未跟踪路径 /Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes/t127-visual-2-settled.png（新 build，TitleBar 无齿轮、Sidebar 底栏齿轮在位）。
- [评审处置] 主 Agent 双轴评审通过（spec pass / standards pass-with-notes），minor：归档帧 2-settled.png 停在旧 titlebar。已机械处置：像素校验新帧（TitleBar 右簇 3 钮/76.7lg vs 旧 4 钮/109.5lg，同右锚 21.1lg；Sidebar 底栏齿轮两帧均在位 ~294lg；本会话模型不支持看图，改用 PIL+numpy 像素几何校验 + 构建产物字符串校验双证据）→ 复制入 worktree → 票 Comments 注明 → 提交 f0b11b1，工作区干净。
- [终态] 分支 t127-settings-entry tip = f0b11b1（实现 02e1c33 → 翻转 b4d0774 → 帧刷新 f0b11b1）；票面 Status=ready-for-human；工作区干净；未 checkout main、未 merge、未 push。遗留：本次 electron smoke 在无关 ticket-90 阶段遭环境争用 flake（t123 并发 smoke 所致，历史 run 全绿佐证）——主 Agent 如需全绿全套 run 可择机重跑。
- [评审] 双轴自审通过：Standards 轴（无死代码/GearIcon import 已删/注释全部同步真实/keymap+reducer 契约零改动/lint 4 文件 0 报错/新 smoke 腿沿用既有 stage 惯用法，退役 log 标记 settings_gear_toggle_ok 无外部引用）；Spec 轴（票面 Acceptance 逐条对照全过，含票 74 停靠语义字节级不变——App.tsx 仅注释 diff）。
