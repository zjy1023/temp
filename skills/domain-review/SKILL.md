---
name: domain-review
description: 检查视频标注平台的区间、时长、提交日、时区和提交锁定规则是否被破坏。
---

# Domain Review

用于每次修改 `backend/app/domain/`、`services/assignments.py`、`services/tasks.py` 后自检。

## 检查清单

- [ ] 所有时间都是整数毫秒，没有浮点秒参与计算。
- [ ] 区间是半开区间 `[start_ms, end_ms)`，`end_ms > start_ms`。
- [ ] 先校验范围/边界，再校验重叠；错误码顺序稳定。
- [ ] 重叠条件是 `start_ms < prev_end`；首尾相接允许。
- [ ] 提交时重新读数据库片段并校验，不信任客户端。
- [ ] `total_duration_ms` 由服务端计算并快照。
- [ ] 只统计 `SUBMITTED`；草稿、`RELEASED` 不计。
- [ ] 业务日按 `APP_TIMEZONE` 的 `submitted_at` 归集。
- [ ] 空提交必须 `confirm_empty=true`，且 `task_count` 仍计 1。
- [ ] 提交后锁死：重复提交 409，草稿写入 409。
- [ ] 草稿 ID 必须属于当前 assignment；未出现的旧片段删除。
- [ ] 每个 assignment 最多 500 段。

## 需要看的测试

- `backend/tests/unit/test_intervals.py`
- `backend/tests/unit/test_time.py`
- `backend/tests/integration/test_draft_submit.py`
- `backend/tests/integration/test_stats.py`
