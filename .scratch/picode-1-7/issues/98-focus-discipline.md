# 98: 按钮焦点纪律——blur 归还 composer、focus 圈仅键盘

**What to build:** 全局按钮焦点纪律：①鼠标点击与菜单键盘选择完成后**按钮立即 blur、焦点归还 composer 输入框**（Enter 永远回到发送——现状：点完 + / 选完模型 / 点完 History 后 Enter 被聚焦按钮吃掉）；②橙色 focus 圈**只在纯键盘 Tab 导航出现**（:focus-visible——鼠标流永远不可见；Tab 圈保留 = Q19 拍板）；③全局清扫交互控件（chip / History / + / 菜单行 / 工具卡钮 / 侧栏钮 / 顶栏钮）。

**背景（取证）：** `--accent-orange #ec7931`（`app.css:25`）focus-visible 规则散布（md-block-btn:5006 / diagram menu item:5244）；点击/菜单选完焦点滞留 → 浏览器原生 Enter 激活聚焦钮（操作者截图 pi17-focus-rings 三现场）；菜单键盘统一是 1.6 票 68/69 基座——本票不得破坏其 hover/键盘选中模型。

**Blocked by:** 91（图片预览浮层——composer 群收官后统一清扫）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：点 + → Enter = 发送（不触发文件选择）；选完模型 → Enter = 发送（不重开菜单）；点 History → Enter = 发送；composer 输入焦点全程保持
- [ ] 菜单键盘导航（1.6 票 68/69 行为）零回归——键盘选完同样归还 composer
- [ ] Tab 导航 focus 圈可见（:focus-visible），鼠标点击后无圈（截图级视觉断言）
- [ ] 清单留档：全量交互控件扫描结果（无遗漏控件）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
