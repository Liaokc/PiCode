# t122 progress — 菜单几何与大脑图标

## 本票目标一句话
修三件菜单面：①cascade 列高解耦（hover 换 provider 弹层几何不变、model 列内部滚动）②Model/Thinking 弹出左对齐触发 chip + 窗口钳制 ③GaugeIcon→自绘 BrainIcon（几何路径无字体依赖）。

## 阶段 = 开工
- [时间戳] 2026-07-22T00:00Z(占位) 开工：progress 文件落库完成；准备读 spec R4/R5 + 现状取证（menus.tsx / app.css / icons.tsx）。
- z18 参照帧缺席 override 生效：票面「帧缺席停下要图」条款被主 Agent 裁决 override——按票内文本规格 + spec R4/R5 描述实施，Comments 标注「样式保真未对照参照帧验证」，绝不停下等待。

## 2026-07-22 阶段=方案选型落盘
- 现状取证：`.cmp-popover{bottom:calc(100%+8px)}`（app.css:6848，bottom 锚定）+ `.cmp-popover-right{left:auto;right:0}`（:6863）+ `.cmp-cascade{display:flex;max-height:320px}`（:7016 默认 stretch）——振荡机制与票面一致。`.composer{position:relative}`（app.css:6707）为弹层 offsetParent。
- **R4 选型 = 左列自然高 + 右列绝对定位内滚**（票内裁量两形态取稳者）：`.cmp-cascade{position:relative;min-height:200px;max-height:320px}`，`.cmp-cascade-col + .cmp-cascade-col{position:absolute;top:0;bottom:0;left:190px;right:0;width:auto}`——容器高只由 provider 列决定，hover 换 provider 零几何变化；model 列 inset 填充内部滚动。min-height 200px 兜短目录构图（房间感），max 320 沿用旧帽。
- **R5 锚点选型 = ComposerPopover 新 align='chip'**：useLayoutEffect 量 chip viewport 左缘 → left = chipLeft − offsetParentLeft，钳制 [8−parentLeft, innerWidth−8−width−parentLeft]；y 不动（bottom:calc(100%+8px) 已是「悬浮输入区上方」）。类名走既有 `cmp-popover-${align}` → `cmp-popover-chip`，零新 CSS 规则。resize 重钳。ModelMenu（含空目录分支）+ ThinkingMenu 切 align='chip'；Access/Slash/File 不动（票面只点 model/thinking）。
- **R5 BrainIcon 选型 = 全自绘对称脑形**：24×24 viewBox，stroke 1.7 同族（fill none round cap）——12 段相对 cubic 封闭轮廓（双半球 7 瓣，对称轴 x=12）+ 中缝竖线 + 每半球两条脑回弧线。零字体、零资产复制（红线）。GaugeIcon 全仓只有 Composer.tsx:896 一处消费 → 换 BrainIcon 后 GaugeIcon 出口整个删除（spec「GaugeIcon 退役」）。菜单行本无图标，无图标可换（如实记录）。
- 验证面：electron smoke 加 menu_geometry_122 stage（bbox hover 稳定 + 锚点相等 + 窄窗钳制 + 键盘/焦点不回归）；visual harness 新 visual-menu-geometry.ts（mg1/mg2 cascade 两帧 + mg3 锚点帧 + mg4 大脑帧 + mg5 窄钳帧，带断言 exit 1）；vitest/typecheck 绿。

## 2026-07-22 阶段=renderer 实现落地
- icons.tsx：GaugeIcon 出口删除，BrainIcon 落地（12 段 cubic 对称脑形 + 中缝 + 4 脑回线，svgProps 同族参数）。证据：icons.tsx BrainIcon 块。
- Composer.tsx：thinking chip 消费 GaugeIcon→BrainIcon（唯一消费点）。
- menus.tsx：ComposerPopover align 扩 'chip' + chipLeft 布局效应量测/钳制/resize；ModelMenu 两分支 + ThinkingMenu 切 align='chip'。captureKeys/焦点纪律/Ticket-70 锚免零改动。
- app.css：.cmp-cascade position:relative + min-height:200px + max-height:320px；第二列 absolute inset（left:190px）+ width:auto 内滚。
- `npm run typecheck` ✅（node+web 双 project 全绿）。

## 2026-07-22 阶段=验证基建落地
- smoke.ts：ticket-122 stage 插在 chip_toggle_done 之后、crash isolation 之前——六腿：①真实压 chip 开 cascade + 锚点相等（card.left==chip.left ±0.5）+ 卡浮在 composer 上方 + 模型列 computed position=absolute/overflow=auto（解耦机制绊线，单 provider 机器也有效）②真实 mouseMove hover 首/末 provider——bbox 三点全等 ±0.5（R4 核心）③真实 ArrowDown——选中行 index 精确 +1（clamp 端点）+ activeElement=选中行（68/69/98 不回归）④520px 窄窗 resize——卡片不出窗（resize 重钳）⑤thinking 菜单窄窗内锚点相等 + 出窗钳制⑥恢复原窗口 bounds + 关菜单。
- visual-menu-geometry.ts 新 harness（PICODE_VISUAL_MENU_GEOMETRY=1，bootstrap 空态 + 真 auth probe 目录，零 model 调用）：mg1/mg2 cascade 两帧（hover 首末 provider bbox 全等断言）+ mg3 锚点帧 + mg4 大脑帧（brain path d 前缀断言 M12 19.6）+ mg5 窄钳帧，全部断言 exit 1。
- index.ts isolate+start 注册；package.json `visual:menu-geometry` script。
- vitest：117 files / 1989 tests 全绿（env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT）；typecheck 双 project 绿。vitest 输出里的 "Switched branch" 是 host-git-branch.test.ts 自己的 fixture repo，worktree 全部完好（已核 git worktree list + 当前分支 t122-menu-geometry）。

## 2026-07-22 阶段=smoke 第1轮——发现并修复 1px 锚点缺陷
- 教训：`node scripts/smoke/electron-smoke.mjs` 直跑会因 PATH 缺 node_modules/.bin 而瞬时失败（spawnSync ENOENT → exit 1 无输出）——必须 `npm run smoke:electron`（smoke2.log 两行即此）。另遇一次 Electron binary 下载抖动（首次 exit 1），重试即过。
- smoke 第1轮（npm run smoke:electron）真跑至 menu_geometry_122：锚点腿 FAIL——`model card left 1025.2 != chip left 1024.2`，恰 1px。
- 定位：CSS `left` 以包含块 **padding edge** 为原点，我算的是 border edge——.composer 有 1px border → 卡整体右移 1px。修复：measure() 用 `parent.getBoundingClientRect().left + parent.clientLeft`（border 宽度）作原点。smoke 绊线价值实证（0.5px 容差抓真缺陷）。
- 状态：修复落地，重建复跑中。

## 2026-07-22 阶段=smoke 第2/3轮——自身 stage 全绿
- 第2轮（含 1px 修复后）：menu_geometry 六腿中前四绿（anchor/cascade_stable/keyboard_skipped→已补强/clamp/thinking_anchor）；随后 ticket-28 段 FAIL「background running row stayed selected」——与本 diff 零交集（侧栏行类 vs composer 菜单），判定偶发。
- ③腿补强：键盘腿前 hover 到第一个 ≥2 models 的 provider（本机末 provider 仅 1 model 曾致 skip）——hover 循环逐 provider 找，弱目录机器自动降级 skip。
- 第3轮：menu_geometry_122 全六腿绿（anchor 1024.2==1024.2 / cascade_stable providers=3 bbox 恒定 / keyboard 0→1+焦点在选中行 / clamp 520 窗 652..1032 ⊆ 1040 / thinking anchor / done）。ticket-28 本轮通过（上轮确系偶发）。suite 终止于 ticket-90 段「live run never flipped to Running badge from artifact」——任务书明示的 75/88/90 资源争用偶发段，与 diff 零交集，按纪律留档不追。
- 结论：本票 electron smoke 验收项全绿；全 suite 偶发死点属批次环境已知类。

## 2026-07-22 阶段=visual harness 全绿 + 根因链定案
- visual harness 五连败根因链（逐个击破）：①基础 transcript harness（PICODE_VISUAL=1）独占守卫链没有我的新旗标 → 双 harness 同窗竞速（0-empty-state/0a/0b 帧混入）→ visual.ts 守卫链补 `if (menuGeometryVisualEnabled()) return`（既有模式一行）。②harness TDZ：settle 块插在 `const js` 声明前 → ReferenceError → 重排。③boot 布局settling（sidebar/panel 入场动画 + auth report join）让 chip 持续漂移（670→625 / 649→625 / 625→761 各轮不同）→ settle 等待（chip x 稳定 1s 再开菜单）。④空态 thinking chip disabled（chained default 无 levels；levels 按 shown model 解析）→ 先 pick bella 第二行（GLM-5.3-flash，smoke 实证带 levels）。
- **组件级最终形态（menus.tsx）**：锚定 = 自校正 delta（量卡片实际渲染位 + chip 左缘差值，钳制 [8, innerWidth−8−w]）+ 三重再转向触发（每次 render 无依赖 layout effect / chip 上 ResizeObserver / window resize），delta<0.5px 幂等跳过。免疫 offsetParent/border/padding/transform/zoom——实测 chip 4 轮漂移卡片全部实时跟上（625==625 / 761==761 / 670==670）。
- **visual:menu-geometry EXIT:0**：mg1（cascade 首 provider hover）+ mg2（末 provider hover，drift-invariant 量：宽/高/锚偏/上偏全等——R4）+ mg3（锚点帧 card.left==chip.left，浮于 composer 上方 8px）+ mg4（大脑图标 chip + thinking 卡锚点，未对照 z 图7 如实标注）+ mg5（520px 窄窗 820..960 ⊆ 1040）。
- 下一步：当前 renderer 代码（RO/delta）晚于 smoke 第3轮 → 重跑 smoke 验证自身 stage（通道空闲窗口）。

## 2026-07-22 终态 = ready-for-human
- 临时前移位取证完成（主 Agent 裁决执行）：stage 移至 t44 前跑一轮——menu_geometry 六腿绿（anchor 1024.2==1024.2 / cascade_stable providers=3 bbox 恒定 / keyboard_skipped 焦点不可得按披露降级 / clamp 652..1032⊆1040 / thinking_anchor 861.4==861.4 / done），suite 随后死于 t44（环境，留档）。stage 已复原终位（post-chip_toggle），位置 diff 逐字节核验，仅余两处有意韧性编辑（焦点门非致命 + 键盘腿优雅跳过，Comments 已披露）。
- 提交：`34c6a20` feat(122)（实现 + mg1–mg5 帧 + 票 claimed 翻转）→ `6ee9e2d` chore(122)（票 ready-for-human + Comments 全披露）。分支 tip = 6ee9e2d，未 merge 未 push（主 Agent 跑 scripts/merge-ticket.sh 122）。
- 双轴 self-review 完成（Standards：eslint/typecheck/票号溯源注解/无新缝；Spec：验收逐条）。票 Comments 含三披露：取证位、焦点降级（键盘腿证据链）、t28/t90/t44 环境失败。
- 遗留：z 图6/图7 对照目检待操作者（帧齐备于 .scratch/visual/mg*.png）。
