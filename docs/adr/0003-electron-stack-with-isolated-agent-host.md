# Electron 同构技术栈 + 独立 agent host 子进程

PiCode 采用与 ZCode 相同的技术土壤：**Electron + React + TypeScript + electron-vite**，理由是像素级复刻一个 Electron 渲染层时，同构栈成本最低、还原保真度最高；且 Pi SDK 是 Node 包，可直接运行于主进程侧。

进程形态：Pi Agent 逻辑不直接活在主进程中，而是运行于**独立的 agent host 子进程**，经 IPC 与渲染层通信。获得崩溃隔离（agent 故障不拖垮整个壳）、资源边界清晰，并为多工作目录留出空间。

数据形态约束：尽管 1.0 仅支持单窗口单活动会话（α 形态），所有会话相关接口与存储自第一版起按"每会话独立 host 实例"设计（β 形状），后续升级无需迁移。
