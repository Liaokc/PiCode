# 88: 侧栏双态预览——SVG/HTML 渲染+源码、图片直显

**What to build:** 侧板文件标签的预览分类扩展，端到端：①**SVG** = 渲染态（img data-URL——img 中的 SVG 脚本不执行，静态渲染安全）+ 源码双态，默认渲染；②**HTML** = 渲染态（**sandboxed iframe：allow-scripts、无 allow-same-origin、无 Node 访问**——LLM 生成的带内联脚本报告完整渲染且帧隔离）+ 源码双态，默认渲染，相对资源以文件所在目录为 base；③双态切换 UI 复用 markdown 的 Rendered/Source segmented control（wrap 行开关沿用「source 态才显示」规则）；④**常见图片（png/jpg/gif/webp）从 binary 拒显改 img 直显**（单态无源码）。超限大文件回退源码（markdown 的 size 上限语义沿用）。

**背景（取证）：** 预览分类现仅三态——markdown（唯一双态先例）/ source / binary（`preview/policy.ts` kindForEntry + `PreviewTab.tsx:213-220` binary 拒显分支）；SVG/HTML 现落 source、图片落 binary。markdown 的 segmented control 与 view-model 是本票的既有先例（`PreviewTab.tsx:115-133`）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 表驱动：分类纯函数扩展（svg/html/image 按扩展名 + 既有文本嗅探；超限回退源码）
- [ ] electron smoke：SVG 打开默认渲染 + 切源码；HTML 打开 iframe 渲染（内联脚本执行探针 + **沙箱断言：帧内无 Node/app 访问**）；png 打开直显；markdown 双态不回归
- [ ] HTML 相对资源（同目录 css/img）以文件目录为 base 正常加载
- [ ] 安全核查留档：iframe sandbox 属性清单 + 不触碰凭据/不写外部文件声明
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；visual 渲染帧
