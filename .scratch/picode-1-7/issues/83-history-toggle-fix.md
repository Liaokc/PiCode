# 83: History 按钮 toggle 修复——再点必收

**What to build:** 会话顶栏 History 按钮（branch-history 下拉）展开后**再次点击必收起**；点击外部、Esc 关闭路径不回归。修复「点开后再点不收（关了又开）」。

**背景（取证）：** 票 70 同构竞态——`TreePanel.tsx:37` 挂 document 级 mousedown 外点关闭（不豁免 owning 钮）+ `ChatView.tsx:274` / `App.tsx:1559` click toggle：点 History 钮时 mousedown 先命中外点判定（钮在 panel 外）→ onClose 置 false → click 再 toggle 又弹开。修法照票 70：外点关闭豁免 owning 钮（mousedown 落在 History 钮内则不关，交给 click toggle 收起）或等价实现，票内裁量。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] 展开态再点 History 必收起（electron smoke 断言：mousedown/click 序列回放）
- [ ] 真外点照关、Esc 照关、选择分支/复制等面板内动作不误关
- [ ] 树面板 navigate/fork/onClose 既有行为零回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
