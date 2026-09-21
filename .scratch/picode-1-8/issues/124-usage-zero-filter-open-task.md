# 124: 用量页修缮——零用量模型过滤 + Open task 按钮删除

**What to build:** 两件用量页修缮（并票——同页同波次）：①**零用量过滤（R9）**——所选 Time Range 内 **0 token 模型**从 Daily Token Trend 图例序列 + Model Usage 圆环扇区 + 圆环图例剔除（`shared/usage/` 纯投影函数 `excludeZeroTokenModels`，trend/donut 共用同一过滤）；非零极小用量**保留**（Q3=A 裁决——数据源如实：用过就是用过）；Time Range 切换（7/30 days）动态重投影；DrillDown 会话行不动（会话粒度如实）。②**Open task 按钮删除（R15）**——`DrillDownPanel` 行内 Open task 按钮与 `onOpenTask` 布线删除（功能 = 跳回该会话主界面，操作者判定冗余），行保留纯展示。

**背景（取证）：** 图9：qwen38_27 "0 tokens" 照样出现在圆环图例与曲线图例（GLM-5.3 10.62M/0% 为非零极小——按 A 保留）。Q3 裁决 = 严格 0 token 才剔。`DrillDownPanel.tsx:85-89` onOpenTask → UsagePage → App 聚焦会话；操作者：「我感觉就是回到主对话界面，感觉这个按钮很冗余，如果是这样的话就把这个按钮删了」——功能核实一致，删。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：过滤纯函数表驱动（0/非零极小/混合模型 × 范围切换重投影；空结果降级如实——全零时图空态而非臆造数据）
- [ ] electron smoke / visual：7d/30d 切换后图例无 0-token 模型；非零极小保留；Open task 按钮不存在且行布局不破
- [ ] 票 3x 用量聚合口径（ADR-0002）零改动——本票纯显示层过滤
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P10（R9）+ P18（R15）并票。Q3=A 裁决（严格 0）；Open task 功能核实 = 跳会话后按操作者指示删。
