# 85: 删除 titlebar 幽灵箭头

**What to build:** 标题栏左侧的两枚 ‹ › 箭头（Back/Forward）**删除**——它们是 R1 起就写死 disabled 的占位钮（零 handler），属死 chrome。视图导航历史若日后要做，单独立项（本批范围外记录）。

**背景（取证）：** `TitleBar.tsx:54-60` —— `tb-btn-disabled` + `disabled` + aria-label "Back"/"Forward"，无任何 handler；ZCode 同位是浏览器式视图导航历史（bundle quickPick.command.goBack/goForward 同族），PiCode 交互模型未定义该功能——操作者拍板删除。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] 两枚按钮从标题栏移除（⌘B 侧栏钮与标题文字之间布局正常）
- [ ] 快捷键/aria 快照更新（无 Back/Forward 残留）
- [ ] vitest / typecheck 全绿；纯 renderer 删除，零契约
