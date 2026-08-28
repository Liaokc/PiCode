# PiCode

给 Pi Agent 套一个 ZCode 外壳的桌面应用：**外观与交互属于 ZCode，大脑属于 Pi**。

## Language

### 系统

**PiCode**：
本项目。桌面端 Agent 应用，UI/交互复刻 ZCode，内部逻辑完全由 Pi 提供。
_Avoid_: 壳、客户端（指代不清）

**Pi Agent（Pi）**：
命令行 coding harness，是 agent 行为、模型调用与会话格式的唯一权威实现。作为依赖被嵌入，永不被修改。
_Avoid_: pi-cli、内核

**ZCode**：
现有桌面 App，仅作为 UI/交互的参照物。不修改、不执行其代码，不读写其本地业务数据；允许一次性只读提取样式常量（色值/间距/字号）作像素校准参照，用后即弃；其图标、字体、代码资产一律不得复制进本仓库。
_Avoid_: 参考项目

### 会话

**会话（Session）**：
一次连续的人机协作记录，格式与管理完全归 Pi 所有。TUI 与 PiCode 打开的是同一个会话存储。
_Avoid_: 聊天记录、对话、历史

**无缝衔接（Handoff）**：
同一会话可在 TUI 与 PiCode 任意一侧打开并继续工作，无需转换。
_Avoid_: 同步、迁移、导入导出

**只读跟随（Live Follow）**：
PiCode 旁观一个正在另一端（如 TUI）运行的会话并实时刷新展示；只看不发。
_Avoid_: 实时同步、接管

### 用量

**用量（Usage）**：
从 Pi 会话记录中推导出的 token 消耗统计口径。凡不在 Pi 会话记录中的消耗一概不计。
_Avoid_: 统计、监控（含义过宽）

**估算成本（Estimated Cost）**：
按公开定价折算的费用数字，UI 上必须显式标注为估算。
_Avoid_: 花费（暗示精确）

### 界面语言

布局与控件形态复刻 ZCode，但 **UI 文案一律使用英文**；以下术语是界面元素绑定的精确含义：

**Task**：
侧边栏与会话列表中的单个条目，一个 Task 就是一个会话（Session）。UI 上显示为“New Task”等文案，内部一律称 Session。
_Avoid_: 对话、聊天室、Conversation

**侧边面板（Side Panel）**：
主区右侧可展开的标签页容器。1.0 承载两类标签：终端（Terminal）、审查（Review）。浏览器标签不属于本项目。
_Avoid_: 右侧栏、抽屉

**访问模式（Access Mode）**：
Composer 上的「完全访问」等芯片，映射为审批闸门的预设策略档位。
_Avoid_: 权限（与 trust 混淆）

**思考档位（Thinking Level）**：
Composer 上的「最高」等下拉项，直通 Pi 的 thinkingLevel。
_Avoid_: 推理强度

**桥接（Bridge）**：
把 agent 正在执行的 bash 工具输出投屏到终端标签的单向观察通道。
_Avoid_: 共享终端（暗示双向接管）

## Constraints（词汇化的边界）

**红线**：
不修改 Pi 安装目录与 ZCode 应用内部的任何代码和数据；所有改动只发生在本仓库内。
