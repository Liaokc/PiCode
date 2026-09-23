# Research: 高星 GitHub 项目 README 范式 — PiCode README 设计简报

> **调研对象**:PiCode(macOS 本地桌面 app,Electron + React,包装 Pi coding agent,MIT,v1.8.0)。
> **目标**:产出可直接落地的 README 设计决策,达到高星开源项目的专业度。

## 调研方法与限制(必读)

- 本次运行环境**未提供 web 搜索/抓取工具**。以下例证基于研究员对这些项目 README 的直接知识(**截至 2025 年年中**);所有链接为真实仓库/raw 地址,但内容**未逐条实时核验**。
- star 数为**约数**(截至 2025 年年中,未实时核验)。
- 迭代快的项目(Cherry Studio、OpenHands、Warp)README 改版频繁,落地前请 spot-check raw 链接。
- 证据标注:`[知识库证据]` = 对 README 内容的记忆性描述;`[推断]` = 研究员建议。置信度:高 / 中 / 低。

## 摘要

高星桌面/AI 工具类项目的 README 存在一条高度趋同的**黄金骨架**:居中 logo + 项目名 + tagline → badge 行(必含 license,通常含 CI/版本) → 语言切换行(如双语) → 1–3 句定位 → **第一屏 hero 截图** → emoji feature 列表 → ≤10 行快速开始 → 贡献/致谢/License。中英双语的主流做法是**双文件互链**(README.md + README.zh-CN.md + 顶部语言行),而非单文件混排。对 PiCode 的直接结论:英文主 README + 中文版互链、第一屏放 app hero 截图(可用现成 `visual:transcript` harness 产出)、badge 行只放真实存在的徽章(license MIT + platform macOS 起步)、把现有超重工程段落(smoke/visual 详单)下沉到 docs/,README 本体控制在 ~200–300 行。

## 调研样本(13 个,三类)

| 项目 | 类别 | star(约) | 语言组织 | 链接(raw) |
|---|---|---|---|---|
| lobehub/lobe-chat | AI 桌面/Web | ~50k | 英文主 + 十余语言互链 | https://raw.githubusercontent.com/lobehub/lobe-chat/main/README.md |
| CherryHQ/cherry-studio | AI 桌面(Electron) | ~20k+ | 中文默认 + 多语言互链(待核) | https://raw.githubusercontent.com/CherryHQ/cherry-studio/main/README.md |
| All-Hands-AI/OpenHands | AI 工具(原 OpenDevin) | ~50k | 英文 | https://raw.githubusercontent.com/All-Hands-AI/OpenHands/main/README.md |
| continuedev/continue | AI 代码助手 | ~27k | 英文 | https://raw.githubusercontent.com/continuedev/continue/main/README.md |
| zed-industries/zed | 桌面编辑器(Rust) | ~55k | 英文 | https://raw.githubusercontent.com/zed-industries/zed/main/README.md |
| warpdotdev/Warp | 终端(仓库偏 issue tracker) | ~22k | 英文,极简 | https://raw.githubusercontent.com/warpdotdev/Warp/main/README.md |
| lmstudio-ai/lms | 闭源 app 的开源 CLI | ~10k | 英文 | https://raw.githubusercontent.com/lmstudio-ai/lms/main/README.md |
| Bin-Huang/chatbox | AI 桌面 | ~25k | 英文为主(细节置信低) | https://raw.githubusercontent.com/Bin-Huang/chatbox/main/README.md |
| ant-design/ant-design | 中文社区顶级组件库 | ~94k | 英文主 + 多语言互链 | https://raw.githubusercontent.com/ant-design/ant-design/master/README.md |
| yangzongzhuan/RuoYi-Vue | 中文企业级模板 | ~47k | 纯中文,无英文版 | https://raw.githubusercontent.com/yangzongzhuan/RuoYi-Vue/main/README.md |
| qishibo/AnotherRedisDesktopManager | Electron 桌面(中文社区) | ~31k | 单文件双语(英中并列) | https://raw.githubusercontent.com/qishibo/AnotherRedisDesktopManager/master/README.md |
| microsoft/vscode | Electron 编辑器 | ~165k | 英文,极简工程型 | https://raw.githubusercontent.com/microsoft/vscode/main/README.md |
| agalwood/Motrix | Electron 下载器 | ~46k | 英文 | https://raw.githubusercontent.com/agalwood/Motrix/master/README.md |

注:分支名(main/master)按研究员记忆标注,若 404 请以仓库默认分支为准。样本覆盖度:FirstCommit 类项目研究员无可靠记忆,未纳入(见 Missing evidence)。

---

## Findings

### ① 顶部横幅/logo 布局

**F1.1 居中"logo + 项目名 + tagline"是绝对主流。** logo 图(或含文字的品牌横幅)居中,项目名保留为文字标题(h1/h3),紧跟一句 tagline;badge 行紧随其后同容器居中。
**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)、[Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)、[Motrix](https://github.com/agalwood/Motrix/blob/master/README.md)、[ant-design](https://github.com/ant-design/ant-design/blob/master/README.md)、[Continue](https://github.com/continuedev/continue/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F1.2 logo 尺寸惯例:独立 app 图标约 120–250px 宽(常见 `width="200"` 级别);含文字的全宽 banner 通常 600–800px+。** Cherry Studio 用 ~160–200px 圆形 app 图标,Motrix 用品牌 logo 图,ant-design 顶部放 logo 图。各项目像素不一,区间比精确值重要。
**Support:** 知识库证据(具体像素为区间记忆)。**Confidence:** 中。

**F1.3 项目名务必保留为文字标题。** 利于搜索、复制、无图环境与读屏;纯图无文字的头部罕见。反例样本:VS Code 顶部只有文字标题、无 logo、无 badge——巨无霸项目可以素,新项目不宜学。
**Sources:** [VS Code README](https://github.com/microsoft/vscode/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F1.4 语言切换行位置:badges 之后、正文简介之前。** 也有项目放在 badges 之前(变体),但"badges → 语言行 → 简介"是更常见的顺序。
**Support:** 知识库证据。**Confidence:** 中高。

**F1.5 例外谱系(反向参考):** VS Code(纯文字工程型)、Warp(极简短文,仓库主要做 issue tracker)、RuoYi-Vue(中文企业风:logo + 长文 + 超长功能清单,视觉规范弱)。这三类都不是 PiCode 应模仿的头部形态。
**Support:** 知识库证据。**Confidence:** 中高。

**PiCode 落地建议 `[推断]`:** 头部用 `<div align="center">` 包:原创 app 图标(约 160–200px,注意红线——**不得复制 ZCode 图标资产**)+ `# PiCode` 文字标题 + 一句 tagline(现有 README 第一段精炼:"A local macOS desktop app that wraps the Pi coding agent in a product-grade shell")+ badges 行 + 语言行。

### ② Badge 集合惯例

**F2.1 必备集合(桌面/AI 工具类):CI、release/版本、license 三件套;强烈推荐:平台、下载量、社区(Discord/微信群);star/fork 徽章非标配。** 工程型项目(Zed、ant-design、VS Code)不放自 star 徽章;部分社区型项目(Lobe-Chat 一类)会挂。
**Sources:** [Motrix](https://github.com/agalwood/Motrix/blob/master/README.md)(release + license GPL-3.0 + downloads)、[ant-design](https://github.com/ant-design/ant-design/blob/master/README.md)(npm version + downloads + CI + coverage + license)、[Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)(version + license + platform + downloads)、[Zed](https://github.com/zed-industries/zed/blob/main/README.md)(CI + license)。**Support:** 知识库证据。**Confidence:** 高(集合构成)/ 中(具体某项目挂了哪几枚)。

**F2.2 顺序惯例:CI → release/版本 → license → platform → downloads → 社区。** license 靠前是主流(合规信号优先)。顺序存在项目间变异,但"CI/version/license 在前"稳定成立。
**Support:** 知识库证据。**Confidence:** 中。

**F2.3 生成方式:CI 用 GitHub Actions workflow 自带徽章端点,其余一律 shields.io。** CI:`https://github.com/<owner>/<repo>/actions/workflows/<ci>.yml/badge.svg`;版本:`https://img.shields.io/github/v/release/<owner>/<repo>`;license:`https://img.shields.io/github/license/<owner>/<repo>`;下载量:`https://img.shields.io/github/downloads/<owner>/<repo>/total`。几乎无人使用 GitHub 原生静态标签拼 badge 行。
**Support:** 知识库证据(shields.io 用法为平台公开事实)。**Confidence:** 高。

**F2.4 桌面 app 特有惯例:平台徽章(`platform: macOS | Windows | Linux`)+ GitHub 下载量徽章,替代 Web 项目的 npm downloads。** 这是桌面工具建立"可安装、有人用"信任感的组合。
**Sources:** [Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)、[Motrix](https://github.com/agalwood/Motrix/blob/master/README.md)。**Support:** 知识库证据。**Confidence:** 中高。

**F2.5 Star History 折线图:项目有 star 基础(约 1k+)之后放 README 底部"Star History"小节。** 用 `https://api.star-history.com/svg?repos=<owner>/<repo>&type=Date` 嵌入;早期项目放会显得冷清,反而减分。Lobe-Chat 底部有此图(置信中高),Motrix 印象亦有(置信中)。
**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 中。

**PiCode 落地建议 `[推断]`:** 诚实原则——**只放真实存在的徽章**。当前(未公开 release、CI 状态未知):license MIT + platform macOS(+ 有了 CI 后补 CI,发布后补 release/downloads)。可抄骨架:

```markdown
<p align="center">
  <!-- CI:<a href="https://github.com/<org>/picode/actions/workflows/ci.yml"><img src="https://github.com/<org>/picode/actions/workflows/ci.yml/badge.svg" alt="CI"></a> -->
  <a href="LICENSE"><img src="https://img.shields.io/github/license/<org>/picode" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/platform-macOS-black?logo=apple" alt="platform: macOS">
  <!-- 发布后:<a href="releases"><img src="https://img.shields.io/github/v/release/<org>/picode" alt="Release"></a>
  <a href="releases"><img src="https://img.shields.io/github/downloads/<org>/picode/total" alt="Downloads"></a> -->
</p>
```

### ③ 中英双语组织方式

**F3.1 主流模式 = 双文件互链:默认 README.md + README.zh-CN.md,顶部语言切换行。** 这是国际项目与中文头部项目共同的标准做法。
**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)(英文主 + README.zh-CN.md + 十余种语言变体)、[ant-design](https://github.com/ant-design/ant-design/blob/master/README.md)(英文主 + README.zh-CN.md + 葡语等)。**Support:** 知识库证据。**Confidence:** 高。

**F3.2 语言行标准写法:当前语言纯文本、其他语言带链接,`|` 分隔,语言名用本地化名称("简体中文"而非"Chinese"),紧随 badges。** 典型形态:`English | [简体中文](./README.zh-CN.md)`;ant-design 顶部即为此式(English / Português / 简体中文 …);Lobe-Chat 的语言矩阵覆盖十余语种(社区 PR 贡献翻译)。
**Support:** 知识库证据。**Confidence:** 高(式样)/ 中(具体语种清单)。

**F3.3 中文核心用户的产品会反转主次:中文为默认 README.md,英文另置。** Cherry Studio 以中文为默认语言、多语言互链(截至记忆时点;项目迭代快,需 spot-check)。
**Sources:** [Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 中。

**F3.4 单文件双语(英中两段并列在同一 README 内)是轻量做法,代表 ARDM(英文段 + 中文段)。** 缺点:文件超长、双份维护、锚点跳转困难;高星大项目一律双文件,单文件双语多见于中小中文社区项目。
**Sources:** [AnotherRedisDesktopManager](https://github.com/qishibo/AnotherRedisDesktopManager/blob/master/README.md)。**Support:** 知识库证据。**Confidence:** 中高。

**F3.5 纯中文 README(无英文版)在中文企业级项目常见(RuoYi 系)。** 面向国际受众或希望被国际社区发现的项目不建议;RuoYi 的形态(超长功能清单 + 系统截图纵排 + QQ 群)是"企业模板"范式,不是"产品"范式。
**Sources:** [RuoYi-Vue](https://github.com/yangzongzhuan/RuoYi-Vue/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F3.6 平台特性(待核实):GitHub 自 2023 年起会自动识别多语言 README 变体(如 README.zh-CN.md)并在仓库首页文件头部显示语言切换下拉。** 即便有平台支持,显式语言行仍是惯例(兼容纯文本渲染与外部镜像)。
**Support:** 研究员记忆,建议以 GitHub docs/changelog 核实。**Confidence:** 中。

**PiCode 落地建议 `[推断]`:** **README.md 英文主 + README.zh-CN.md 中文版**,顶部互链行(现有 README 正文与 UI 文案已是英文,CONTEXT.md 等内部文档是中文,正好构成"英文对外门面 + 中文内部协作"的双层结构)。若产品决策认为核心受众是中文开发者,可反转主次(Cherry Studio 式),但国际专业感会打折扣——建议英文主。语言行:

```markdown
**English** | [简体中文](./README.zh-CN.md)
```

### ④ 截图/GIF 呈现

**F4.1 hero 截图放第一屏(badges/简介之后、feature 列表之前)是绝对主流。** 用户不滚动就该看到产品长什么样。
**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)、[Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)、[Continue](https://github.com/continuedev/continue/blob/main/README.md)、[Motrix](https://github.com/agalwood/Motrix/blob/master/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F4.2 多图排版:单 hero 大图优先;辅图用 2 列 `<table>` 网格或 `<details>` 折叠区。** RuoYi 式"十几张截图纵向堆叠"是反面教材(信息密度高但劝退)。
**Sources:** [RuoYi-Vue](https://github.com/yangzongzhuan/RuoYi-Vue/blob/main/README.md)(反例)。**Support:** 知识库证据。**Confidence:** 中高。

**F4.3 GIF vs 静态图取舍:hero 用高清静态图(PNG/WebP);交互演示用短 GIF(数秒)或视频链接。** GIF 生动但体积大、加载慢,GitHub 对超大附件(约 10MB 级)渲染受限;不少项目用 GitHub user-attachments 资产托管。规则:静态图负责"长什么样",GIF/视频负责"怎么动"。
**Support:** 知识库证据 + 平台事实。**Confidence:** 高(取舍原则)/ 中(具体项目用哪种)。

**F4.4 图床:repo 内 `assets/`(或 `.github/assets/`、`docs/`)目录或 GitHub 附件,不要用第三方图床。** 中文项目用 gitee/osc 图床的教训:外链失效后 README 满屏裂图。
**Support:** 知识库证据 + 平台事实。**Confidence:** 中高。

**F4.5 截图质量本身是卖点:retina 分辨率、真实工作内容(非空壳/占位数据)、深浅色主题各一张是加分项。** Lobe-Chat 的截图是精心制作的产品级素材,视觉门槛直接拉高项目档次。
**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)。**Support:** 知识库证据 + 研究员解读。**Confidence:** 中。

**PiCode 落地建议 `[推断]`:** hero 用 `npm run visual:transcript` 产出的真实转录截图(主界面,retina);辅图 3–4 张(设置窗 / Usage 页 / 终端 dock + Review 标签 / 子代理目录)排 2 列表格;发布时把图片从 `.scratch/visual/` 拷入 repo 内 `assets/`(scratch 目录通常不入库、路径不稳定)。

### ⑤ 结构骨架

**F5.1 黄金骨架(高星桌面/AI 项目高度趋同):**

1. 居中 logo + 项目名 + tagline
2. badges 行
3. 语言切换行(双语项目)
4. 1–3 句定位(是什么 / 给谁 / 核心差异)
5. hero 截图
6. ✨ Features(emoji + 粗体短语 + 一句说明)
7. 📦 安装 / 快速开始
8. 📚 文档链接
9. 🛠️ 本地开发 / 从源码构建
10. 🤝 Contributing
11. 🙏 Acknowledgements / 致谢
12. 📄 License

**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)、[Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)、[ant-design](https://github.com/ant-design/ant-design/blob/master/README.md)、[OpenHands](https://github.com/All-Hands-AI/OpenHands/blob/main/README.md)、[Continue](https://github.com/continuedev/continue/blob/main/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F5.2 emoji feature 列表:中文系项目近乎标配;每条 = emoji + 粗体关键词 + 一句话;8–12 条为宜。** ant-design 的 `✨ Features / 📦 Install / 🔨 Usage / 🛠 Development` emoji 分节标题是这一风格的原型;英文工程型项目(VS Code、Motrix)则用朴素 bullet——两种风格都成立,但"社区产品"定位选前者。
**Support:** 知识库证据。**Confidence:** 高。

**F5.3 TOC:基本不需要。** GitHub 自动在 README 头部渲染标题 outline(目录按钮),显式 TOC 多数情况冗余;仅超长 README(RuoYi 式数百行)才考虑内置目录。
**Support:** 知识库证据 + 平台事实。**Confidence:** 高。

**F5.4 快速开始长度:30 秒 / 5–10 行内可跑通。** 一行命令优先(OpenHands 的一条 `docker run`;Motrix 的 `brew cask install`);开发者路径(clone + install + dev)单列小节,不与用户安装路径混排。
**Sources:** [OpenHands](https://github.com/All-Hands-AI/OpenHands/blob/main/README.md)、[Motrix](https://github.com/agalwood/Motrix/blob/master/README.md)。**Support:** 知识库证据。**Confidence:** 高。

**F5.5 收尾三段惯例:Contributing 链到 CONTRIBUTING.md;Acknowledgements 列上游与灵感来源;License 一句话 + 链接 LICENSE 文件。** 对"包装上游 agent"的项目,致谢段同时承担**关系声明**义务(说明与上游项目的关系、非官方性),这在 AI 周边工具里是信任关键。
**Support:** 知识库证据 + 研究员推断(关系声明部分)。**Confidence:** 中高。

### ⑥ 最打动人的 5 个 README 细节(可直接抄)

1. **Lobe-Chat 的多语言切换矩阵** — 顶部一行十余种语言互链,一句话展示国际化诚意,且翻译由社区 PR 持续贡献。在 PiCode:先做 English | 简体中文 两语言,结构留好扩展位。**Sources:** [Lobe-Chat](https://github.com/lobehub/lobe-chat/blob/main/README.md)。**Confidence:** 高。
2. **OpenHands 的一行 Docker 启动** — 把"试用门槛"压到一条命令;README 的使命不是介绍而是"让你 30 秒用上"。在 PiCode:开发者路径给最短命令序列(`npm install && npm run dev` + 前置条件:macOS、Node 24+、Pi 凭证),并把这一段放在很靠前的位置。**Sources:** [OpenHands](https://github.com/All-Hands-AI/OpenHands/blob/main/README.md)。**Confidence:** 中高。
3. **ant-design 的"徽章行 + Development 段"工程信任组合** — CI/coverage/license 徽章 + 三条命令的本地开发说明,让贡献者立刻能跑起来。在 PiCode:现有 `npm run dev / typecheck / test / smoke` 体系是现成素材,README 只需收纳成一小节,并把 smoke 套件作为质量信号一句话带过(细节下沉 docs)。**Sources:** [ant-design](https://github.com/ant-design/ant-design/blob/master/README.md)。**Confidence:** 中高。
4. **ARDM 的"痛点对比式"第一句** — 开头直接说清与竞品的差异("…it won't crash when loading a massive number of keys"),不做泛泛自夸。在 PiCode:独有卖点应进第一屏——"与 Pi TUI 共享同一会话库:Handoff 无缝接力 + Live Follow 实时旁观",这是别的桌面壳没有的差异点。**Sources:** [ARDM](https://github.com/qishibo/AnotherRedisDesktopManager/blob/master/README.md)。**Confidence:** 高。
5. **Cherry Studio 的"中文默认 + 平台徽章 + 下载量徽章"信任组合** — 桌面 app 用平台覆盖 + 下载量替代 Web 项目的 npm 下载,建立"可安装、有人用"的直觉信任。在 PiCode:公开发布后照搬(platform: macOS → 逐步扩平台;downloads 徽章)。**Sources:** [Cherry Studio](https://github.com/CherryHQ/cherry-studio/blob/main/README.md)。**Confidence:** 中。

备选细节(次优先):Zed 的安装小节(下载页 + `curl … | sh` 脚本);Motrix 的分平台安装小节;Lobe-Chat 底部 Star History 图。

---

## PiCode README 骨架草案(可直接改用)

现状诊断:现有 README 是优质**工程文档**(架构表、smoke、visual、packaging),但缺少**产品门面**(logo/badges/截图/features/license 段),首屏无产品叙事。改造原则:P0 增门面,P1 精简下沉工程段落。

```markdown
<div align="center">
  <img src="assets/picode-icon.png" width="180" alt="PiCode">   <!-- 原创图标,勿用 ZCode 资产 -->
  <h1>PiCode</h1>
  <p>A product-grade macOS desktop app around the <a href="https://github.com/earendil-works/pi">Pi coding agent</a>.</p>
  <!-- badges: license MIT + platform macOS(+ CI / release / downloads 待真实存在后补) -->
  <p><b>English</b> | <a href="./README.zh-CN.md">简体中文</a></p>
</div>

<!-- 1–3 句定位:外壳属 ZCode 形态、大脑属 Pi;与 TUI 共享会话库(Handoff / Live Follow) -->

<!-- hero 截图:assets/hero.png(visual:transcript 产出) -->

## ✨ Features
- 🔁 **Handoff** — 与 Pi TUI 共享同一会话库,任意一侧创建/恢复
- 👁️ **Live Follow** — 实时旁观 TUI 运行中的会话
- 🖥 **三区外壳** — Tasks 侧栏 + 聊天主区 + Terminal(真 PTY)/ Review / Preview 侧板
- 📊 **Usage 统计** — tokens / streaks / heatmap / 成本估算(含 TUI 会话)
- 🧩 **技能 · Packages · MCP 管理** — 设置窗内管理 Pi 的扩展面
- 🛡 **只读红线** — 永不修改 Pi 与 ZCode 的代码和数据

## 📦 Quick Start
<!-- 前置:macOS + Node 24+ + ~/.pi/agent 有效凭证;npm install && npm run dev -->

## 🖥 Requirements / 🏗 Architecture(保留现有表格,精简)/ 🧪 Testing & Smoke(一句话 + 链接 docs)

## 🤝 Contributing / 🙏 Acknowledgements(致谢 Pi agent;声明与 ZCode 的参照关系与非官方性)/ 📄 License (MIT)
```

配套改造:`README.zh-CN.md` 全文镜像;smoke/visual 详单移 `docs/`(README 各留一句 + 链接);目标行数 ~200–300 行。

## Contradictions(分歧与例外,未强行裁决)

- **默认语言之争**:英文主(Lobe-Chat / ant-design)vs 中文默认(Cherry Studio)。两边都有成功案例;取决于受众定位,研究员倾向 PiCode 英文主。
- **star 徽章**:社区型项目挂、工程型一线项目(Zed / ant-design / VS Code)不挂。PiCode 建议不挂。
- **emoji**:产品/社区定位用,纯工程定位不用。PiCode 定位是产品 → 建议用。
- **单文件双语 vs 双文件**:ARDM 式单文件在中小中文项目流行,但高星大项目一律双文件。
- **GIF vs 静态**:GIF 更生动但重;主流折中是"静态 hero + 短 GIF/视频演示"。

## Missing evidence(未核实与缺口)

- **无实时核验**:所有例证为知识库内容(截至 2025 年年中);raw 链接的**当前**内容可能与描述有差(尤其 Cherry Studio、OpenHands、Warp 迭代快)。
- star 数为约数,未实时核对。
- FirstCommit 类项目:研究员无可靠记忆,未纳入样本(不编造)。
- GitHub 多语言 README 自动语言选择器的确切官方文档链接未提供(平台行为为记忆)。
- PiCode 的发布状态(是否公开 repo / 有无 CI / 有无 release)未知 → badge 集合需按实际状态裁剪。
- ChatBox、Warp、lms 的 README 细节置信中低,样本表中已标注,未作为主要例证。

## Sources

**Kept:**
- Lobe-Chat README — 双语互链与语言矩阵标杆 (https://github.com/lobehub/lobe-chat/blob/main/README.md)
- Cherry Studio README — 中文默认桌面 AI 客户端范式 (https://github.com/CherryHQ/cherry-studio/blob/main/README.md)
- ant-design README — 徽章行 + Development 段工程标杆 (https://github.com/ant-design/ant-design/blob/master/README.md)
- Motrix README — Electron 桌面经典布局 (https://github.com/agalwood/Motrix/blob/master/README.md)
- AnotherRedisDesktopManager README — 单文件双语 + 痛点式开头 (https://github.com/qishibo/AnotherRedisDesktopManager/blob/master/README.md)
- OpenHands README — 一行命令快速开始 (https://github.com/All-Hands-AI/OpenHands/blob/main/README.md)
- Continue README — AI 助手安装矩阵 (https://github.com/continuedev/continue/blob/main/README.md)
- Zed README — 工程型简洁范本 (https://github.com/zed-industries/zed/blob/main/README.md)
- VS Code README — 极简工程型反例样本 (https://github.com/microsoft/vscode/blob/main/README.md)
- RuoYi-Vue README — 中文企业级全中文范式(反面参照) (https://github.com/yangzongzhuan/RuoYi-Vue/blob/main/README.md)
- Warp README / lms README / ChatBox README — 辅助样本(置信中低,已标注)

**Rejected/deprioritized:**
- FirstCommit 类项目 — 无可靠记忆,拒绝凭印象描述
- "awesome README" 类二手汇总帖 — SEO 重、转述层,不如直接读标杆原文
- star-history.com 官网 — 仅引用其 SVG API 用法,不作独立论据

## Next steps

1. 用带 web 工具的会话抓取 Lobe-Chat / Cherry Studio / Motrix 当前 README 全文,对简报结论做 diff 式核验(重点:Cherry Studio 默认语言、Lobe-Chat 徽章清单、GitHub 多语言 README 平台行为)。
2. 产品决策两件套:双语主次(建议英文主)+ 发布状态(决定 badge 集合与 Quick Start 形态:开发者路径 or 下载安装包)。
3. 设计原创 app 图标;用 `npm run visual:transcript`(等 harness)产出 hero 与辅图,入库 `assets/`。
4. 按"骨架草案"改写 README.md 并新增 README.zh-CN.md,把 smoke/visual 详单下沉 docs/,交评审。
