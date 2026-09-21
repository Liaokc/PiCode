# 110: 双端包安装互通——Packages 列表挂载刷新 + 验证矩阵

**What to build:** 打通并验证「任一侧装 pi packages、两侧直接用」的完整链路：①**缓存盲区补齐**——Packages 节挂载/设置窗打开时 force 刷新列表（现状：per-dir 缓存无 TTL，force 仅在 PiCode 自家 op 后触发——**TUI 侧 `pi install` 之后 PiCode 列表不自动反映**）；②**双端验证矩阵**（electron smoke + 实测留档）：PiCode Packages 节安装 → `~/.pi/agent/settings.json` packages 数组断言 + TUI 下次启动可用；TUI `pi install` → PiCode 列表即时反映 + 新会话可用——真实包 pi-mcp-adapter / pi-subagents 就是现成测试对象；③**生效语义如实提示**——安装成功文案注明「新会话生效」（运行中会话不热加载；TUI 同语义需 /reload——两侧一致，不伪装）。

**背景（取证）：** 安装路径机制面已互通——Packages 节安装走 SDK `DefaultPackageManager.installAndPersist`（**与 `pi install` 完全同一代码路径**，落盘同一 settings.json packages 数组）；缺口 = `packages-service.ts` 列表 per-dir 缓存无 TTL，`force` 现仅自家 op 触发（`PackagesSection.tsx` 的 done/refresh(true) 路径），节挂载是 `refresh(false)`（命中缓存）。会话加载时机 = host 启动（两侧同语义）。

**Blocked by:** 89（MCP 管理节——真实测试对象之一挂在其 UI 上；同设置窗文件群）.

**Status:** ready-for-human

## Acceptance

- [x] Packages 节挂载/设置窗打开 → force 刷新（electron smoke：TUI 侧改 settings.json → 打开节 → 列表即时反映）
- [x] 验证矩阵留档（electron smoke + 实测记录）：PiCode 装 → settings.json 断言；TUI 装（直接改文件或 `pi install`）→ PiCode 列表反映；新会话加载新包（包提供的 slash 命令/扩展可探针）
- [x] 真实对象验证：pi-mcp-adapter / pi-subagents 在双端列表与加载面均正常（不重新安装，验证既有包的呈现）
- [x] 安装成功文案含「新会话生效」语义（全英文）；失败 toast 不回归（票 64）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

### 2026-09-21 实现（分支 t110-packages-cross，基座 d432eff = main tip，含 T89）

三处代码改动：

1. **缓存盲区补齐**（`PackagesSection.tsx`）：节挂载 effect 从 `refresh(false, cwd)` 改为 `refresh(true, cwd)`——per-dir 缓存无 TTL 且仅自家 op 清除，TUI 侧 `pi install` 写的同一 settings.json 在重挂前不可见；挂载即全新视角，必须 force。设置窗各节条件渲染，nav 进入/重开窗口都走同一挂载 effect，一处覆盖两入口。
2. **生效语义如实提示**（同文件）：安装成功 toast 改为 `Installed {source}. Takes effect in new sessions.`——运行中会话（两侧）不热加载，TUI 等价动作是 /reload，文案只说真话。
3. **ToastStack 补挂设置分支**（`App.tsx`，实现中发现的票 63 时代缺口）：settings 视图的 early-return 自建 app-shell 从未渲染 ToastStack——设置窗打开期间所有 toast（含票 64 起的 Packages op 失败 toast）一直没有渲染面，onNotify 推进了无人渲染的 reducer。加性行补挂后，票 110 的成功文案可见，「失败 toast 不回归」首次在 UI 层面真正成立。

### 2026-09-21 验证矩阵留档（electron smoke + 实测）

| 矩阵格 | 证据 | 结果 |
|---|---|---|
| PiCode 装 → settings.json 断言 | smoke packages 阶段 ③（SDK op host = pi install 同一代码路径写沙箱 settings.json，读文件断言 relPkg 入列） | `packages_install_ok` |
| TUI 装 → PiCode 列表即时反映 | smoke 阶段 ⑦：**外部**写 settings.json（模拟 `pi install` 的落盘面）→ nav 离开再回 Packages（重挂）→ 两真实包行无手动 Refresh 即时出现，NPM 徽章 + counts 解析 | `packages_tui_side_reflected_ok`；**红验证**：组件临时回退 refresh(false) 时同步骤失败（「the TUI-side install never reached the remounted list」），证明步骤真咬盲区 |
| 新会话加载新包（slash/扩展探针） | smoke 阶段 ⑩ **直接探针**：TUI 侧装入后，在沙箱 agent dir 起新会话 host，断言其 `slash_commands` 通告含包提供技能命令 `/mcp-scripting`（pi-mcp-adapter）与 `/council-mode`（pi-subagents）——装完→新会话加载链路本 diff 内直接验证，双 waiter 先于 createSession 注册防竞态 | `packages_new_session_loads_ok`（同一全量绿跑内） |
| 真实对象·PiCode 列表呈现 | smoke 阶段 ⑦：npm:pi-mcp-adapter / npm:pi-subagents 行 NPM 徽章 + 组件 counts 解析（非 Not installed） | 同上 |
| 真实对象·TUI 列表呈现 | 实测 `pi list`：两包各带安装路径输出（npm:pi-subagents、npm:pi-mcp-adapter → ~/.pi/agent/npm/node_modules/…） | 本机实测 |
| 失败 toast 不回归（票 64） | 设置分支补挂 ToastStack 后失败 toast 首次真正可见；smoke 阶段 ⑧ untrusted 项目锁 + 拒绝文案路径未动 | `packages_project_untrusted_ok` |

**验证命令结果**：typecheck 双 tsconfig 干净；vitest 1930/1930 全绿（114 文件）；electron smoke 全量 `SMOKE done`（37 hosts 无孤儿）。

**环境竞态披露（留档同款，复跑即过）**：全量 smoke 共 6 次重跑后收口——slash_gate 指针 toast（GLM 长思考 send 被忙碌门拦，同票 83）、multi-session background text_delta 90s 超时、ticket-60 copy-as-TSV、ticket-86 Review 树、ticket-98 Escape，均为模型速度/焦点类环境竞态；与本票 diff 无关（涉及阶段与本票改动无交集）。

**红绿验证方法披露**：为绕开模型阶段竞态浪费，验证期临时把 packages 阶段前移至 smoke 首位 + 临时回退组件挂载行（均未提交，验证后 `git checkout` 还原）；正式全量绿跑在原始阶段顺序、无临时补丁下完成。

**dev-app serialization 披露**：smoke 与 visual:settings 前均 `ps` 自查；wt-108 的 electron app 18:03 启动，与本会话 visual:settings（纯截图 harness，无端口占用/时序断言）短暂重叠，如实记录；其后 electron 类命令不再并行。

**截图**：`.scratch/visual/s6-settings-packages.png`（visual:settings s6 帧，Packages 节状态词汇全貌）。

### 2026-09-21 code-review 双轴采纳（review-spec + review-standards 并行）

**Spec 轴**（1 实质发现，已闭合）：「新会话加载新包」一格原为交叉引用式留证（借票 89/90 既有阶段，加载的是本就装好的包）——已改为 smoke 阶段 ⑩ 直接探针（装完→新会话 host 的 slash_commands 断言双包技能命令），验收覆盖从间接变直接。ToastStack 补挂判定为验收项正当化（成功文案必须可见），非超范围。

**Standards 轴**（无硬违反；判断性意见全部采纳）：①真实包 symlink 种子形状第三份 → 提模块级 `seedSandboxPackage()` 共享 helper，票 89/90 调用点一并迁移（T90 优雅降级分支保留；票 89 的 sandboxAdapter 死变量顺带清除）；②本 hunk 内重复字面数组 → `tuiInstalled` 常量；③`clickNav110` 为第 7 份 nav 点击形状 → 提模块级 `clickSettingsNavItem()` 并迁移全部 6 处既有内联点（票 96/76/63/89/64）；④票号后缀变量名（toasted110 等）→ 去后缀用用途名（installToastedSeen 等），票号留在注释；⑤App.tsx 双挂载同 props → 上提共享 `toastStack` 元素。附附带风险（rmSync 与 MCP 阶段同路径耦合）随 helper 化解。全部迁移点由全量 smoke 重跑覆盖。
- 2026-09-21 (merge session，per 操作者验收指令「110 工单已验收」)：**Status 词汇归一化** `resolved`（wayfinding 词汇，与 107 同款）→ `ready-for-human`（merge-gate 口径）——意图无歧义仅词汇修正。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
