# 41: New Task 空态模型/思考档——目录通供 + 链式默认

**What to build:** New Task / 启动空态下，Composer 的模型与思考档芯片**真实可用**：模型菜单列出可用 provider→model 目录（消费 **auth probe 的模型目录**——复用既有 `--auth-probe` 短命 host 机制与其 IPC 通道，main 层缓存，零新契约）；芯片显示**链式默认**（偏好 defaultModel/defaultThinkingLevel → Pi 兜底默认并标注 default → 全无配置才落底纹提示语）；空态所选模型/思考档进 pending 链，随 create_session 一并送达。空下拉消失。

**背景（取证）：** 现状空态 `chat = initialChatState()`，models 仅由活 host `models_available` 填充——New Task 无 host 即无目录，"Select Model ⌄/Thinking ⌄" 灰占位、点开空白条（截图 pi13-* 三帧）；auth probe 报告已含完整模型目录（`AuthProbeReport.models`，数据在、未接线）。

**Blocked by:** 38（composer 菜单与 App 接线同文件，串行规避双写者）。

**Status:** resolved

- [ ] 空态模型菜单列真实 provider/model（与发送后一致）；思考档七档可用
- [ ] 芯片显示链式默认：偏好默认 → Pi 兜底（标注 default）→ 无配置占位提示语（有底纹，非空白）
- [ ] 空态所选项随首条消息送达会话（行为与发送后选模型一致）
- [ ] 目录投影 + 链式默认决议纯函数表驱动（Seam-1：probe 报告 → 菜单形；偏好 → 生效默认）
- [ ] electron smoke（空态菜单列真实模型 + 所选项送达）；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R2，grilling Q2 方案 a）。复用 auth-probe 链（票 11 先例）；目录投影同型先例 groupModelsByProvider。波次：W2。
- 2026-09-07 (t41-newtask-model-catalog): **implemented** @ 0e294db（三提交：f146a4f Seam-1 纯函数 + 16 条表驱动测试 / 3ada0d2 渲染接线 / 0e294db electron smoke 新首轮）。**验收全绿**：typecheck、lint、vitest 980/980（rebase main 含 42 后）、electron smoke 全链 97 步 `SMOKE done`（空态 chip 链式默认 GLM-5.3 + default 标签、菜单 42 providers 真目录、模型 override GLM-5.3-flash + 思考七档 + Off 点选、`session_created.model`/`composer_state` 证实所选项随 create_session 送达且按模型能力钳制）。**实现注记（含 code-review 报备）**：① 零新契约——目录走既有 `settings:refresh-auth` 通道（App 级自动扫描，ModelsSection auto-scan 先例，每应用生命周期一次，启动快照改 `setSettings(prev)` 保留探测态防竞态）；空态所选项走 `create_session.defaults` 附加字段（票 11 通道），选挥优先于偏好默认；「pending 链」按「随 create_session 一并送达」字面落在此字段。② 「Pi 兕底」＝findInitialModel 最后一环（首个有凭据 provider 的首个模型）；未读 Pi settings.json 的 defaultModel/defaultProvider——读它须给 probe 报告加字段（契约增量，票面禁止）；chip 为咨询值，首个 `composer_state` 即纠正（smoke 实机演示）。③ ModelMenu 对任意空目录渲染底纹提示（含 in-session 通用文案）——服务「空下拉必须消失」，超出票面字面但同宗旨；无偏好→'medium'（SDK DEFAULT_THINKING_LEVEL）。④ smoke：chat:pick-directory 的 smoke 专用短路（无人在场的空态发送）；composer DOM 驱动器提升到模块级与票 38 共用；票 40 settle 探针补 opacity 收敛（subpixel size 先于 fade 尾帧收敛的 flake，非回归）。**补充（operator feedback, 2026-09-07）**：思考菜单只列模型实际支持的档位 @ 5464757。**契约增量报备**：`AuthProbeReport.models[]` 增可选字段 `thinkingLevels?: ThinkingLevel[]`（probe 侧镜像 SDK `getSupportedThinkingLevels`：非 reasoning→['off']、null 映射=不支持、xhigh/max 需显式映射）；旧报告无字段降级全七档，isAuthProbeReport 增量校验不破旧载荷。纯层 `resolveNewTaskThinkingLevels` + `clampThinkingLevelToLevels`（SDK clamp 同语义）保证芯片值与菜单一致（GLM-5.3：芯片 'High [default]'、菜单 Low/High/Max）。smoke 改口径：菜单行数 1..7、点首行（构造上必被支持）、会话开在该档。captures 重拍。验收：vitest 987/987、typecheck、lint、electron smoke 全链 `SMOKE done`。

**操作者合并**：`bash scripts/merge-ticket.sh 41`。验收截图：`.scratch/picode-1-3/issues/41-newtask-model-catalog/captures/`（1 空态 chip 链式默认 bella/GLM-5.3 + Medium，均带 default 标签；2 模型菜单真目录 cascada；3 思考七档菜单——隔离 userData/session store 拍摄，票 40 captures 惯例）。
- 2026-09-07 (merge): merged as **7f0c9bf**（--no-ff，16 文件 +1106/−67，9 提交重放：纯模型 f146a4f→重放、接线、electron smoke、thinking 档位过滤 5464757、对照帧 captures 入库）。验收口径：操作者目检后明说「已验收」。冲突处置：**全部为票文件评论历史对撞，例行取 main 侧（簿记 sync 的分支终版）**——41 会话的 claimed 翻转混在实现提交 f146a4f、后续 4 个 docs/chore 提交反复编辑同一条 implement 评论，逐个与 main 侧终版相撞，终版始终胜出（4 个纯票文件提交被丢弃/判重，代码与 captures 实质内容全部入库）；零代码冲突（会话自行 rebase 到 df54eb4，零代差）。main 终态审计：typecheck + vitest **987/987**（73 文件，+23）；new-task-models 纯模型 + 309 行套件在位；契约增量 thinkingLevels 落 auth-status.ts:71（operator-approved additive，probe 测试覆盖）；38 gateSlashCommand / 39-40 data-closed / 39-42 纯函数 / CONTEXT 词条全部幸存；三张对照帧（空态 chip / 模型目录 / 思考七档）随票入库；无冲突标记。解锁：无（45 仍阻于 44）。进度 **8/9**。
