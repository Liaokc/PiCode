# 107: 文件浏览器实时刷新 + 置顶行 View files 入口

**What to build:** 两件侧栏文件浏览器（ticket 26 FileBrowser）修缮：①View files 打开的目录树**实时反映磁盘变化**（新增/删除/改名在树中可见，无需返回重进）——实时刷新优先；仅当实时通路被实测证明不可靠（漏事件 / .git 事件风暴 / 性能劣化）时降级加**手动刷新钮**（浏览器标题栏 back 钮旁）。②置顶区会话行（ticket 33，两视图共用的 Pinned 分区）hover 增加 **View files 入口**——当前 View files 只在项目组头 hover 三钮位（票 26），置顶行（Timeline 平铺下无组头可达）无入口；点击切到该会话所属项目的文件浏览器（与组头同 `setBrowserTarget` 通路）。

**背景（取证）：** FileBrowser 数据 = `window.picode.preview.load(cwd, path)` 既有预览目录读通道（契约无新事件），已加载子目录**缓存于 reducer**（`children` 记录，`requested` 防重入），无任何失效/重读路径；main 侧全仓无 `fs.watch`（grep 实证）。置顶区在两视图恒置顶渲染（`Sidebar.tsx` Pinned section，`grouped.pinned` → TaskItem），行 hover 动作只有 pin/rename/archive 槽（票 35 状态点锚位），无 View files；置顶会话的项目 cwd 需经会话→组映射取得（不依赖组头渲染）。实时刷新两条实现路径（票内裁量，验收项定门槛）：**a) watch 通路**——main 侧 fs.watch 递归监听 cwd（**契约增量**：新 IPC 事件 additive-only + host-contract smoke 报备入账，同 90/96/97/100 先例；须过滤 .git/node_modules 类事件风暴，watcher 生命周期随浏览器挂载/Back 卸载）；**b) 零契约通路**——既有 preview 通道失效重读（聚焦/展开/轮询择机）。操作者原话裁决：实时刷新要做；刷新钮仅在实时不可靠时可以不做。

**Blocked by:** 84（Sidebar.tsx 同热点——84 拖拽重排先落定，本票置顶行改动在其上收；FileBrowser 本体与 84 无碰撞，如需提前可拆票，见 Comments）

**Status:** ready-for-human

## Acceptance

- [x] 文件浏览器实时性：打开 View files 后，磁盘新增/删除/改名（已展开目录即时可见；懒加载目录首次展开为现读）无需返回重进即反映——**watch 通路**（a 选项落地）：失效/重读核心逻辑表驱动 vitest 覆盖（`tests/shared/file-browser.test.ts` watch-invalidated 表 + `tests/main/preview-watch.test.ts` 19 例）
- [x] watch 通路契约：新 IPC 事件 additive-only 入账（见 Comments ③ 契约层级报备）；watcher 随 unmount/Back 清理零泄漏——注入式 factory 句柄计账 vitest（10 次进出 created===closed===10）+ electron smoke 10 次重进后刷新仍活（fb107_cycles_clean_ok / fb107_refresh_after_cycles_ok）；.git 等高频目录事件风暴过滤有测试（合成 factory + fake timers：50 连发归并为 1 发、cap 溢出降级 overflow 全量失效）
- [x] 实测实时通路可靠 → **明确不做手动刷新钮**，实测依据见 Comments ②（electron smoke fb107_* 全腿：根/已展开子目录的新增、删除、改名均无需重进即现，含 10 次重进循环后复测；visual 帧实证）
- [x] 置顶区会话行 hover 出现 View files 入口（Timeline 与 By-project 两视图 Pinned 分区行为一致——入口挂在两视图共用的 Pinned 分区渲染上），点击切到该会话所属项目 cwd 的文件浏览器（同组头 `setBrowserTarget` 通路）；组头既有三钮位零回归（smoke fb107_header_form_ok，`.sb-group-action` 计数 = 3）
- [x] 归档/隐藏组语义不破（入口走 `s.cwd` 直映，不依赖组渲染；`filterArchived`/`filterHiddenGroups` 管线零改动；全套 vitest 绿）
- [x] vitest（1898 全绿）/ typecheck（双 tsconfig 清）；跑 smoke 前 `ps` 自查（dev-app serialization：期间实测撞上 wt-106 同-slot 冒烟一次，让位重跑收口，见 Comments ⑤）；全英文 UI 文案
- [x] electron smoke：新增 ticket-107 stage（12 条 fb107_* 断言：置顶行入口 + 组头探针 + 实时刷新 create/deep-create/delete/rename + 10 次重进循环 + 收尾 unpin），全套 `npm run smoke:electron` **exit 0**

## Comments

- 2026-09-17 (merge session，操作者口头需求入册)：需求转写两条 + 码库取证（FileBrowser 无刷新/无 watch、已加载目录缓存于 reducer；置顶行无 View files 入口；preview.load 通道既有可复用；CONTEXT.md 无文件浏览器独立词条——若随票立词条则实时刷新语义一并入册）。**波次归属待操作者确认**：建议排 84 之后（同 Sidebar.tsx 串行避冲突）；若需提前，①文件浏览器刷新可拆票先行（与 84 无碰撞），②置顶行入口仍候 84。合并会话仅入册，不开发。
- 2026-09-17 (merge session，操作者裁决「按 Blocked by: 84 走，波次合并会话调整」)：107 排入 **W9**（与 105/106 同波；W8 已满员 101/103/104）。阻塞 84 为 W2，到 W9 时窗早已解除；与 105（TerminalDock）/106（registry 注入）零碰撞。T107 会话 prompt 已随 session-prompts.md 入册（分支 t107-fb-refresh-pinned-viewfiles，基线含 84 的 Sidebar 结构）。波次表头部波数同步修正 8→9。
- 2026-09-21 (implement session, t107 分支)：**完成，走 watch 通路（a 选项），不做手动刷新钮**。
  - **① 刷新通路设计**：`src/main/preview/watch.ts` —— 应用级**单槽**递归 watcher（`fs.watch(cwd, {recursive:true})`，macOS FSEvents；同 cwd 重入幂等、异 cwd 替换、错误静默关闭不重试环）；事件**归并防风**：200ms 拖尾 debounce，窗口内 raw 事件 cap 200 / 去重目录 cap 40，超限降级 `{dirs:[],overflow:true}` 全量失效；匿名变更（filename null/''）同走 overflow。**事件是 hint 不是数据**——renderer 收 `preview:watch-changed` 后只把受影响**已加载** listing 标 stale（`file-browser.ts` 新 `watch-invalidated` action + `stale` set），仍经既有 `preview:load` 通道现读，读路径是树的唯一真相；stale 重读静默（零 loading 闪烁），`children-loaded/failed` 清 stale（删失目录不重取环）。懒加载目录首次展开照旧现读。**生命周期**：mount `preview:watch`、unmount/Back `preview:unwatch`，vitest 注入 factory 计账 10 进出零增长。
  - **② 刷新钮不做，实测依据**：electron smoke ticket-107 stage 真盘实测——浏览器开着时根目录新建 `gamma.txt`、**已展开子目录**新建 `extra.txt`、删除 `alpha.txt`、改名 `beta.md→beta-renamed.md`，全部无需重进即反映（等待预算 20s，实测亚秒级）；10 次重进循环后 watcher 仍活并再实测一次新建（fb107_refresh_after_cycles_ok）；visual harness `npm run visual:fb107` 三帧含 live-refresh 实证帧。漏事件/风暴/性能无任何实据 → 按验收「可靠则明确不做按钮」执行，标题栏零增量。
  - **③ 契约层级报备（对票面字样的诚实修正）**：本次增量为 **Electron main↔renderer IPC**（`preview:watch`/`preview:unwatch` invoke/send + `preview:watch-changed` 推送，`PreviewWatchEvent` 入 `shared/preview/types.ts`，全 JSON-safe），**不是 Seam-1 host 契约消息**——90/96/97/100 报备先例全部走 `chat:from-host`，而 host-contract smoke fork 的是 agent host 进程，构造上触不到这些通道；硬塞 round 反而不实。故：**host-contract smoke A–K 原样不动且全绿**（旧轮 additive 纪律照旧成立），本次增量的实报备 = electron smoke ticket-107 stage 端到端断言新通道 + 本条入账。preload 三通道纯新增，既有通道零改名零删除（additive-only 成立）。
  - **④ 置顶行入口**：`TaskItem` 新可选 `onViewFiles`（仅 Pinned 分区传入），按钮绝对定位悬停时盖在 hover 让空的时间槽上（时间文本 hover 淡出是票 34 自有规则，行格零位移，同票 35 dot-slot↔archive 内容互换模式）；组头三钮位、Time 槽几何（visual-row-geometry 探针契约）零回归。映射 = `s.cwd` 直取 + `projectLabel`，与组头同 `setBrowserTarget`，归档/隐藏组管线零依赖零改动。
  - **⑤ 验证轨迹**：vitest 1898 全绿（新增 reducer 失效表 10 例 + watch 服务 19 例：映射表/归并/cap/生命周期/真 fs 冒烟）；typecheck 双 tsconfig 清；eslint 触及文件零问题（仓内既有 lint 债在未触及文件，不动）。electron smoke 全套 **exit 0**（12 条 fb107_* 断言全过，35 hosts 零孤儿）。smoke 运行实录：首跑撞票 68 menu_surface 环境竞态（票 96 Comments 已录的同族模型速度竞态，复跑即过）；二跑被 SIGTERM 击落——ps 取证为 wt-106 同窗冒烟撞 serialization slot（非本票问题）；三跑修本票 stage 自身 bug（探针表达式 `?? null` 与外层 `&&` 混用 = SyntaxError 恒败，已加括号 + 失败诊断）；四跑抓出**真缺陷**：FileBrowser `requested` ref 成功后不清、watch 重读被永久跳过——改为 settle 即释放（仅去重 in-flight），此后全绿；另有一次票 88 img 解码竞态（未触及 stage，票 88 自录 flaky 族）复跑自然过。**smoke 两次抓到本票真 bug、两次环境竞态照录**。
  - **⑥ CONTEXT.md**：未随票立词条（文件浏览器仍无独立词条）；若操作者裁定立词条，「实时刷新 = watch hint + 读路径唯一真相、置顶行 View files 入口走会话→cwd 直映」两条语义建议一并入册。
- 2026-09-21 (implement session, 双轴 review 收口)：**review-spec + review-standards 零阻塞**；按发现收口三项：
  - **风暴处理升级（spec 轴发现 c1，真改进）**：纯拖尾 debounce 在**持续风暴**下（长 build）会被不断重置 → 永不 flush → 树冻结到噪音停止。新增 **max-hold**（`PREVIEW_WATCH_MAX_HOLD_MS` = 1s）：窗口被连续事件撑过 1s 即立即 flush，持续风暴下的更新节奏有界（≥1 次/s），安静场景仍 200ms 拖尾归并。表驱动测试补持续风暴例（20 例全绿）。**不做路径排除表**的裁决：票面「过滤 .git/node_modules 类事件风暴」若按路径排除实现，会让树里照显的 .git/node_modules listing 失去刷新（票 26 契约：隐藏条目照显）——与「树即磁盘真相」冲突；故「过滤」落在**有界归并**（debounce + 双 cap + overflow 降级 + max-hold 节奏界），未加载目录的事件本身零成本（reducer 只重读 loaded∩dirs）。
  - **standards 轴判断性意见**：窗口重置重复段抽 `resetWindow()`、`unspecified` 更名 `sawUnnamedChange`（已改）；smoke/visual fixture 双写与 smoke.ts 收段为仓内惯例（从轻，不动）；preload `watch(): Promise<boolean>` 保留（main 侧入参校验的诚实返回，同 terminal:start 先例）。
  - **spec 轴两处字面偏离待操作者追认**：①「host-contract smoke 报备」按 Comments ③ 修正为 Electron IPC 层级报备（electron smoke stage + 本票 Comments，host smoke A–K 不动）；②CONTEXT.md 词条未立（条件式，⑥）。
- 2026-09-21 (merge session，per 操作者验收指令「107 工单已验收」)：**Status 词汇归一化** `resolved`（wayfinding 词汇）→ `ready-for-human`（验收词汇，merge-gate 口径）——意图无歧义仅词汇修正。操作者验收即覆盖 review 留档的两处字面偏离追认：①报备层级修正（Electron IPC 非 Seam-1 host 契约，electron stage + 本条即报备，host smoke A–K 不动）；②CONTEXT.md 词条按条件式默认不立（「实时刷新 = watch hint + 读路径唯一真相、置顶行入口走 cwd 直映」语义建议留档待后续 /domain-modeling 裁量）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
