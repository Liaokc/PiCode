# 10: 用量统计页

**What to build:** 设置窗口壳（导航分组裁剪自 ZCode：General / Appearance / Models / Data & Statistics）+ Usage 页全量：五张数字卡（累计 Token、峰值、最长聊天时长、当前/最长连续天数）；GitHub 式热力格（daily/weekly/cumulative 切换）；近 7 日/近 30 日切换的每模型多色折线趋势；模型占比环形图带图例百分比；数据点下钻到 Session 明细。图表只消费聚合缓存，估算成本处处显式标注。

**Blocked by:** 09 Usage 聚合器、01 净场与脚手架。

**Status:** claimed

- [ ] 全部图形数据来自聚合缓存而非现场扫文件
- [ ] 五卡/热力格/折线/环形对照截图 09 的版式结构一致
- [ ] 时间范围与热力格三种口径切换正确联动
- [ ] 下钻明细能看到来源会话并可跳转回任务
- [ ] 成本数字全部带 estimated 标注
