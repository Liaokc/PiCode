# 134: Finder/Dock 启动也能 spawn subagent——主进程启动时合成子进程 PATH

**What to build:** 从 **Finder/Dock 正常启动**的 PiCode 里，会话内 spawn pi-subagent 也能工作——修复方式 = 主进程启动时**合成子进程 spawn 用的 PATH**：①启动早期（缓存一次，带超时与失败降级）经 `$SHELL -lc 'echo $PATH'` 捕获用户登录 shell 的 PATH 快照；②叠加静态探测的常见 node 安装点（`~/.nvm/versions/node/*/bin`（当前版本）、`/usr/local/bin`、`/opt/homebrew/bin`、`~/.pi/agent/bin`）；③合成结果注入所有需要 PATH 的子 spawn 环境（subagent 子进程；会话 host 如涉及同样注入）。实现候选①②可并用，落点与缓存失效策略票内裁量；**LSEnvironment 方案否决**（PATH 机器相关，不能烧进通用 bundle）。

**背景（取证）：** 操作者实测（2026-09-22 自治批次空跑发现）：Finder/Dock 启动的 PiCode 内会话 spawn subagent 失败；解决办法 = 终端带 PATH 启动 `PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH" open -a PiCode`。根因方向 = launchd 启动的 GUI app 不继承交互 shell 的 PATH（只有系统默认 `/usr/bin:/bin:/usr/sbin:/sbin` 等），操作者的 node/pi 在 nvm 版本目录——spawn 链找不到可执行文件；终端 `open` 继承当前 shell 环境所以带前缀就通。**精确断点（哪个 spawn 缺哪个可执行）= 本票第一验收项插桩定位**（不臆测纪律）。

**注意：** 修复对新启动的 app 实例生效（运行中实例不会热更）；v1.8 自治批次运行本身依赖操作者的启动 workaround，本票修复的是后续所有正常启动。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] **插桩定位 = 第一验收项**：Finder 启动环境下 spawn 失败的精确断点（哪个进程找哪个可执行失败）留档
- [ ] Seam-1：PATH 合成纯函数表驱动（登录 shell 快照 / 静态探测点 / 去重与顺序 / shell 探测失败降级 / 已有良好 PATH 时不劣化）
- [ ] 手工验收记录：**从 Finder 启动（不设 PATH）→ 应用内会话 spawn subagent 成功**；终端 workaround 启动路径不回归；重启前不生效的边界在 Comments 记录
- [ ] Electron 主进程启动延迟无感（PATH 探测不阻塞窗口就绪——超时与异步初始化票内裁量）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 6)：P28 定稿为 R21（纯文本票）。操作者原话：「让我从 Finder/Dock 启动 PiCode 也能让其中的会话 spawn pi-subagent」。v1.8 自治批次空跑实证 spawn 失败 + workaround 有效；根因精确断点留票内插桩。
