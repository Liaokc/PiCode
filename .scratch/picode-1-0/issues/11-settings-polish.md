# 11: 设置面板 + 全局打磨

**What to build:** 设置内容填充：每 provider 只读 auth 状态视图、默认模型/思考等级/启动偏好设置（影响新 Session 默认值）、外观变量占位（暗色仅留位不实现）；⌘K 任务搜索（仅搜任务）；全局 toast/错误提示体系与空态文案体系统一为英文。

**Blocked by:** 04 会话体系与侧边栏、05 Composer 全量、10 用量统计页。

**Status:** resolved

- [x] 设置修改后新建 Session 采用新默认值（对照 SettingsManager 行为）
- [x] auth 状态真实反映凭据健康度，未配置时给出"去 TUI 登录"引导
- [x] ⌘K 键盘可达：唤起、过滤、选中、跳转全程不碰鼠标
- [x] 空态/错误态走查全部界面，文案全英文且语气一致

## Comments

**1e33c5d** — t11-settings-polish 完成，未 merge（操作者执行 `git merge --no-ff t11-settings-polish`）。

- 默认值链路实测：sentinel argv → host 在 session_created/composer_state 前 seed（GLM-5.3 + low 落地；未知模型回退 Pi 默认、思考档位按模型钳制）；seed 仅作用于 boot 创建，fork/resume 不受影响（review 中发现并修复 fork 会误 seed 的 bug）。
- auth 探针：host 进程 `--auth-probe` 模式跑 ModelRuntime（ADR-0003，主进程不加载 SDK）；本机 43 providers / 1316 models 全量枚举，models.json 配置的 key 正确识别为 `configured API key`。探针运行前后 `~/.pi/agent/*` mtime 不变（红线只读验证）。登录引导统一 "Sign in from the Pi TUI (/login)"，无任何 GUI 登录入口。
- ⌘K palette：仅搜任务，fuzzy（title+project），↑↓ 循环、↵ 跳转、Esc 关闭；visual:settings 实测过滤与选中。
- 全局 toast：host_notice（compaction 等）+ session_command_error + 设置加载失败统一走右下角 toast 栈（info 4s / error 8s，同文案去重，上限 3 条）。
- 空态走查补齐：空 transcript 提示行；其余（sidebar/usage/review/preview/terminal/follow/palette）文案检查一致。
- 验证：437 vitest 全绿、typecheck/eslint 干净、smoke:host PASS、visual:transcript 无回归、visual:settings 新增 4 张截图（.scratch/visual/s1–s4）待人工对照。
- 2026-08-28 (merge session): **resolved** — merged into main as `22bb4aa`（base 即当时 main tip，零冲突纯增量）。验收口径：操作者目检通过（per-provider auth 状态、session 默认、⌘K 任务面板、全局 toast 及 s1–s4 截图对照）；合并后 main 复核 46 文件 / 437 vitest 全绿。worktree 与分支已清理。
