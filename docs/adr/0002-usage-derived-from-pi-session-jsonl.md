# 用量统计以 Pi 会话 JSONL 为唯一数据源

用量（Usage）与估算成本的原始数据一律来自 Pi 会话 jsonl 文件中每条 assistant 消息自带的 `usage` 字段，由 PiCode 解析后写入自己的聚合缓存再供曲线查询。不从 ZCode 的 SQLite（`~/.zcode/cli/db`）取数，也不在发送链路旁路自建埋点。

理由：会话存储是 TUI 与 PiCode 天然共享的唯一事实来源——这使 TUI 里跑过的历史自动进入统计，且不触碰 ZCode 数据（守住"不改/不读 ZCode 内部"的红线）。代价是需要处理 jsonl 追加式写入的增量解析与缓存失效。
