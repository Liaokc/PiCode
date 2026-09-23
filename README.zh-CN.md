<div align="center">
  <img src="docs/assets/logo.png" width="128" alt="PiCode" />

# PiCode

**围绕 [Pi 编程智能体](https://github.com/earendil-works/pi) 打造的产品级 macOS 桌面应用。**

外壳的交互与视觉形态参照 ZCode —— 大脑属于 Pi。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![version](https://img.shields.io/github/v/tag/Liaokc/PiCode?label=version)](https://github.com/Liaokc/PiCode/tags)
[![platform](https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white)](https://github.com/Liaokc/PiCode)
[![node](https://img.shields.io/badge/node-%E2%89%A524-339933)](https://nodejs.org)

[English](./README.md) | **简体中文**

</div>

---

会话、历史与用量统计**与 Pi TUI 完全共享**：任意一侧创建的会话，另一侧立刻可见、无缝接力（**Handoff**）；TUI 里正在运行的会话，可以在 PiCode 里实时旁观（**Live Follow**）。这是别的桌面外壳做不到的。

红线：**绝不修改 Pi 安装目录或 ZCode 应用内的任何代码或数据** —— 一切都活在本仓库里。

<p align="center">
  <img src="docs/assets/hero.png" alt="完整工作台：思考、工具调用与实时输出、富 markdown 转录，一屏呈现。" />
</p>

## ✨ 特性

- 🔁 **Handoff 无缝接力** —— 与 Pi TUI 共享同一会话库：任意一侧创建，另一侧接力恢复
- 👁️ **Live Follow 实时旁观** —— 在 PiCode 里实时观看 TUI 正在运行的会话
- 🖥️ **三区外壳** —— 按项目分组的 Tasks 侧栏 · 聊天主区 · 可调侧板（**终端**（真 PTY）、**Review**（工作区 diff）、**文件预览** 三标签）
- 📊 **用量统计** —— token 总量、连续天数、52 周活动热力图、分模型趋势与成本估算，聚合全部 Pi 会话记录 —— TUI 也算
- 🧠 **完整 agent 面** —— 审批门（批准 / 记住 / 拒绝）、Steer 与 Follow-up 队列、思考档位、subagent 舰队，以及设置窗内的技能 · Packages · MCP 管理
- 🛡️ **只读红线** —— 永不修改 Pi 安装目录或 ZCode 应用内的任何代码或数据

## 📸 截图

| | |
|:---:|:---:|
| <img src="docs/assets/feature-code-rendering.png" alt="代码渲染" /> | <img src="docs/assets/feature-usage-stats.png" alt="用量统计" /> |
| 语法高亮代码卡：行号、换行切换与下载。 | 用量页：token 总量、连续天数、52 周活动热力图与分模型趋势。 |
| <img src="docs/assets/feature-approval-queue.png" alt="审批队列" /> | <img src="docs/assets/feature-model-picker.png" alt="模型选择器" /> |
| 审批门与 Steer / Follow-up 队列，内联呈现。 | 双列模型选择器，覆盖全部已配置 provider。 |
| <img src="docs/assets/feature-file-preview.png" alt="文件预览" /> | <img src="docs/assets/feature-command-menu.png" alt="命令菜单" /> |
| 文件预览：markdown 渲染/源码双态切换。 | 斜杠命令菜单，模糊搜索直达。 |

<p align="center">
  <img src="docs/assets/feature-sidebar-projects.png" alt="侧栏" width="60%" /><br />
  <sub>项目侧栏：会话状态点与悬停操作。</sub>
</p>

## 🚀 快速开始

**前置条件：** macOS · Node.js 24+ · `~/.pi/agent` 内可用的 Pi 凭证（与 `pi` TUI 同一套）

```bash
npm install     # Electron 下载卡住时，前缀 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev     # 开发模式启动
```

生成本地应用包：

```bash
npm run package            # → release/PiCode-darwin-<arch>/PiCode.app（本地未签名产物，asar 关闭以便 host 子进程 fork）
npm run package:verify     # ……再以 PICODE_SMOKE=1 启动产物，要求一轮真实会话 smoke 通过退出 0
```

## 🏗 架构

三区外壳：导航侧栏（按项目分组的 Tasks）、聊天主区、可调侧板（终端（完整 PTY）、Review（工作区 diff）、文件预览）。设置窗覆盖默认值、外观、只读 provider 认证状态与用量页。

| 区域 | 职责 |
|------|------|
| `src/renderer` | React UI。绝不 import Pi SDK —— 只消费 IPC 契约上的纯 reducer。 |
| `src/main` | Electron 主进程：host 监管、会话索引（共享库扫描 + Live Follow 尾追）、用量聚合缓存、review/preview 读取器、终端服务（唯一的 node-pty 消费者）。 |
| `src/preload` | 类型化桥，只暴露上述 IPC 面。 |
| `src/host` | 隔离的 agent host 子进程；`@earendil-works/pi-coding-agent`（锁定版本，ADR-0005）**只**在这里加载。一个 host 实例对应一个会话。 |
| `src/shared` | 契约（`ParentToHost`/`HostToParent`）、纯 reducer、解析器与聚合器 —— 可测试的核心。 |

架构决策见 [`docs/adr/`](./docs/adr)（0001–0005，全部现行）；领域词汇表见 [`CONTEXT.md`](./CONTEXT.md)；产品规格见 `.scratch/picode-1-0/spec.md`。

## 🧪 开发

```bash
npm run typecheck          # node + web 两套 tsconfig 的 tsc
npm run lint
npm test                   # vitest 单测套件（三个规格测试缝）
```

## 🔬 兼容性 smoke 套件

一条命令，对真实 Pi SDK 与真实共享会话库跑全部兼容性红线：

```bash
npm run smoke
```

阶段（fail fast，逐阶段计时）：

1. **build** —— electron-vite 打包
2. **host contract** —— 真实 SDK 流式、审批门（批准/记住/拒绝）、访问模式分级、队列语义、模型/思考切换、resume/rename/tree/fork
3. **pty** —— Electron node ABI 下的真实伪终端
4. **usage aggregation** —— 真实 TUI 库只读扫描 + 临时库上的增量 fold 机制
5. **TUI↔SDK 互操作** —— 双向：TUI 写的会话经会话索引、转录与 SDK 自带 `SessionManager` 解析；host 写的会话经 SDK 重开、进索引、fold 进用量、并在第二个 host 进程里恢复
6. **electron app smoke** —— 真实外壳：main→host→renderer DOM、侧栏索引、Live Follow、会话级崩溃隔离、多活跃会话（多个 host 在焦点切换间存活、后台流式、同 pid 重聚焦且转录追平、无孤儿关闭）

阶段 2、5、6 发起真实模型调用（合计数分钟）。

### 会话卫生（票 13）

Smoke 运行绝不写真实会话库。套件导出 `PICODE_SESSION_DIR`
（host 与应用会话索引都认可的临时库），并在整轮运行中验证
`~/.pi/agent/sessions` **零会话文件增长** —— 任何阶段泄漏会话文件即失败。
独立 smoke 入口（`npm run smoke:host` / `smoke:interop` / `smoke:electron`）
同样自隔离。`npm run package:verify` 也遵循 `PICODE_SESSION_DIR`。
认证、模型与设置始终来自真实 `~/.pi/agent` —— 只有会话写入被重定向。
`npm run smoke:layout`（票 29）在临时 **userData** 上启动构建产物，
驱动真实指针拖拽：侧栏宽度钳制 + 重置、两侧板宽度跨重启持久化。

模型用量聚合对 model id 大小写不敏感折叠（网关把配置的
`GLM-5.3-flash` 回显成 `glm-5.3-flash` 时算同一个模型；展示保留首见拼写）。
历史 smoke 污染库的一次性清理（默认 dry run）：

```bash
node scripts/cleanup-smoke-sessions.ts        # 列出将被删除的文件
node scripts/cleanup-smoke-sessions.ts --yes  # 执行删除
```

## 🎞 Visual QA

截图 harness 捕获真实 UI，与 `.scratch/reference/screenshots/` 中的 ZCode 基线做像素比对（记录：`.scratch/picode-1-0/visual-redline-final.md`）：

```bash
npm run visual:transcript   # 转录、菜单、pill/queue、预览、review
npm run visual:settings     # ⌘K 面板 + 设置各分区
npm run visual:usage        # 用量页（确定性 fixture）
npm run visual:multi        # 侧栏状态点（票 20）+ 组悬停操作（票 19）
                            #   + 侧栏文件浏览器（票 26，m9 捕获）
npm run visual:row-geometry # pinned-row 网格探针（票 34；断言测量值）
npm run visual:filter       # 过滤下拉：view/sort、时间线、创建序（票 33；断言探针）
npm run visual:trace        # call-trace 工具面：展开/收起/搜索帧（票 37；断言探针）
npm run visual:codeblock    # 代码卡语言标签：裸 fence 显示 'text'（票 50；断言探针）
npm run visual:answer       # 回合 answer 拆分：尾块 = answer，叙述折叠，工具行在下（票 53；断言探针）
npm run visual:mermaid      # mermaid 图卡：渲染流程图 + 下载菜单 + 全屏，残缺/未闭合回退（票 59；断言探针）
npm run visual:codecard     # 代码卡行号：默认 gutter、startLine 偏移、noLineNumbers 无 gutter（票 60；断言探针）
npm run visual:cwd          # 幽灵 cwd：灰行 + "cwd missing" 元信息、仅无害菜单、自动恢复（票 54；断言探针）
npm run visual:preview      # 文件预览双视图：html iframe（沙箱探针）+ svg/png 渲染帧 + 源码态（票 88；断言探针）
# 终端底坞捕获（经标题栏开关打开）：
PICODE_VISUAL=1 PICODE_VISUAL_TERMINAL=1 npx electron .
```

PNG 落在 `.scratch/visual/`。

## 🤝 参与贡献

Issue 以本地 markdown 工单形式跟踪于 `.scratch/`（见 [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md)），并镜像到 Linear。开发按「一票一分支一 worktree」进行。提交变更前请运行：

```bash
npm run typecheck && npm run lint && npm test
```

## 🙏 致谢

- **[Pi](https://github.com/earendil-works/pi)** —— 本项目包装的智能体大脑与共享会话生态。
- **ZCode** —— 本外壳参照的交互与视觉模型。PiCode 是独立实现，与 ZCode 无隶属或背书关系；未使用任何 ZCode 代码或素材。

## 📄 许可证

[MIT](./LICENSE) © 2026 Liaokc
