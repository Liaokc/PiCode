# 76: 已配置 provider 置顶——设置窗 + 模型菜单同规则

**What to build:** 设置窗 Models 节的 provider 列表与 composer 模型菜单的 provider 列表同规则排序：**已配置（有凭据）在前、未配置在后，组内各按字母序**（对照 pi16-settings-providers：bella 绿点沉底的字母序直出）；composer 模型菜单维持打开时定位+高亮当前 provider 的既有行为、模型列内不重排（高亮即可）。渲染层 join App 已持有的凭据探测报告派生排序——**零新契约**。

**背景（取证）：** 设置窗列表按 SDK 注册表序直出（零排序，小写 provider 按 ASCII 沉底）；composer 分组保持首见序。全链无「已配置置顶」概念。file:line 级根因见 `../intake-grilling.md` R8 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Comments

- 2026-09-15（implement session，t76-providers-first @ ff0f8f2，based on main f7a1f47）：实现 = 新增 `src/shared/provider-sort.ts` Seam-1 纯函数对：`configuredProviderIds`（从探测报告派生已配置集合；null/error/空报告 → null）+ `sortProvidersConfiguredFirst`（已配置在前、未配置在后、组内字母序——locale-free 小写名比较 + providerId 决胜；缺报告原序降级；不改输入、模型列随组引用原样）。三个渲染点接入、host 载荷零改动：①设置窗 Models 节（ModelsSection useMemo 派生一份序，sign-in 列表与 Default model 级联共享同序——DefaultModelRow 改收 providers prop）；②活会话 composer 菜单（App `chatForView` join `settings.auth` 排序 chat.providers 后入 ChatView/Composer）；③New Task 空态（`newTaskProviders` 排序投影目录后入 EmptyState）。composer 的 ModelMenu 本体零改动——打开时定位+高亮当前 provider 的行为原样保留（排序只发生在上游数据）。**过期 OAuth 计入已配置**（authType 非空即有凭据，健康点颜色是设置窗自己的关注点——测试内注明）。验证：①Seam-1 vitest 11 例先 RED（模块不存在）后 GREEN（含与 projectNewTaskCatalog 的组合例：排序不动 piFallback 的报告序语义）；②visual:settings harness——s2 帧 order 断言 + 新增 s2b 级联帧（fixture：Anthropic/Bella/Google/OpenAI 在前、GitHub Copilot/Z.ai 沉后），pi16-settings-providers 重建；③visual.ts 4b-model-menu 帧重建——models_available 载荷掺入未配置组（bella/github-copilot/google/openai/zai 首见序），renderer join fake 报告后断言列序 + 定位高亮（checked==selected==Bella）+ 模型列原序，pi16-model-menu-providers 重建；`visual:transcript` 配 PICODE_FAKE_SETTINGS=1 使报告 fixture 化（副作用：0-empty-state 等帧现为确定性假偏好内容——boot 空态帧内容变化已记录）；④electron smoke——SmokeHooks 增 `getAuthReport`（main 内部测试接线，非渲染契约；index.ts 以 `settings.authReport(false)` 接入），empty-state 菜单序 + 定位（`empty_state_menu_provider_order_ok` / `empty_state_menu_locate_ok bella at row 0`）与设置窗 sign-in 序（`settings_models_provider_order_ok`）三处断言，期望值从 renderer join 的同一份缓存报告计算（任意机器成立：全配置⇒纯字母序；缺报告⇒注册表序）。全套 `npm run smoke` ALL GREEN（6 stages，160s electron stage）；vitest 1334/1334；typecheck 清；改动文件 eslint 清。环境干扰记录：首两轮 smoke 分别挂在 host-contract 'A tools 4'（真模型回合超时，单独重跑该 stage 即绿）与 ticket-44 focus-steal（app.focus 抢焦点失败）——stash 全部改动后同样挂在 ticket-44，证实为环境非本票回归；静机后全绿。审查（双轴）：Standards——1 处缩进（级联闭合大括号）当场修复（eslint 全仓仅剩 64 遗留两处 unused-var 与 EmptyState 既有 warning，均非本票文件）；Spec——票面五项验收全落实，零契约增量（shared/contract.ts 零 diff、host 载荷零改动；SmokeHooks 为 main 进程内部接线，已注明）。

- [x] Seam-1 排序纯函数（configured 优先 + 组内字母序 + 空/缺报告降级为现序）— `src/shared/provider-sort.ts` + `tests/shared/provider-sort.test.ts`（11 例，RED→GREEN）
- [x] electron smoke / visual harness：bella 置顶（对照 pi16-settings-providers / pi16-model-menu-providers 两帧重建）— s2/s2b/4b 三帧 + 断言；smoke 三处 order/locate 断言
- [x] 零契约增量确认（join 既有探测报告）— contract.ts 零 diff；SmokeHooks 为 main 内部测试接线
- [x] 当前 provider 定位高亮不回归 — ModelMenu 零改动；smoke `empty_state_menu_locate_ok` + 4b 断言 checked==selected==当前 provider 行
- [x] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）— 每次运行前检查；文案零新增（注释全英文）
