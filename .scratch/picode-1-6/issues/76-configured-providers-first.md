# 76: 已配置 provider 置顶——设置窗 + 模型菜单同规则

**What to build:** 设置窗 Models 节的 provider 列表与 composer 模型菜单的 provider 列表同规则排序：**已配置（有凭据）在前、未配置在后，组内各按字母序**（对照 pi16-settings-providers：bella 绿点沉底的字母序直出）；composer 模型菜单维持打开时定位+高亮当前 provider 的既有行为、模型列内不重排（高亮即可）。渲染层 join App 已持有的凭据探测报告派生排序——**零新契约**。

**背景（取证）：** 设置窗列表按 SDK 注册表序直出（零排序，小写 provider 按 ASCII 沉底）；composer 分组保持首见序。全链无「已配置置顶」概念。file:line 级根因见 `../intake-grilling.md` R8 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Seam-1 排序纯函数（configured 优先 + 组内字母序 + 空/缺报告降级为现序）
- [ ] electron smoke / visual harness：bella 置顶（对照 pi16-settings-providers / pi16-model-menu-providers 两帧重建）
- [ ] 零契约增量确认（join 既有探测报告）
- [ ] 当前 provider 定位高亮不回归
- [ ] 全英文文案；跑 dev app / e2e / smoke / visual 前 `ps` 自查（dev-app serialization）
