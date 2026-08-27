# Pi SDK 以独立锁定版本嵌入，不引用全局安装

为保障 TUI 与 PiCode 之间的无缝衔接不因版本漂移而破裂，PiCode 将 `@earendil-works/pi-coding-agent` 作为 npm 依赖锁在自己的 package.json 中，不检测也不直接加载用户全局安装的 pi CLI。发布流程须附带"TUI 全局版本 ↔ 内嵌 SDK 版本"的会话格式兼容性冒烟测试；应用内提供受控的依赖升级提示而非静默跟随外部环境。

被拒方案：动态引用全局安装 —— 把稳定性押在 PiCode 控制之外的升级行为上，且无法保证会话格式一致。
