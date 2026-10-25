# 04 · 测试计划

## 1. 测试策略

```text
                 ┌─────────────────────┐
                 │  E2E（Playwright）   │  少量关键路径
                 ├─────────────────────┤
                 │  API/集成测试        │  权限、租户、提交、统计、视频
                 ├─────────────────────┤
                 │  单元测试            │  区间、时长、时区、纯函数
                 └─────────────────────┘
```

原则：

- 领域规则用纯函数单测，不依赖数据库和 HTTP。
- 权限和租户隔离用 API 集成测试，必须真的走 Cookie 和数据库。
- 关键用户路径用 E2E，不追求覆盖所有 UI 分支。
- 500 MB 视频、AV1/Safari 这类环境问题用手工验收，记录结果。
- 每个 bug 修复后补一个回归测试，写进验证日志。

## 2. 测试环境与数据

- 后端：pytest + httpx + 独立 PostgreSQL 测试库。
- 每个测试用事务回滚或 truncate；不要让测试互相污染。
- seed 固定数据：
  - 租户 Alpha、Beta。
  - 平台管理员 1 个，租户管理员 2 个，标注员 3 个。
  - 演示视频 1–2 个（小文件）。
  - 任务：可领取、已领取、已提交各至少一个。
- 前端 E2E：Playwright 启动完整栈（Docker Compose 或本地 dev），使用固定 seed。
- 时间：统计测试直接写 `submitted_at`，不依赖当前时间；需要“现在”的地方用可注入 clock。

## 3. 单元测试

### 3.1 区间校验 `validate_segments`

| 用例 | 输入（毫秒） | 期望 |
|---|---|---|
| 空列表 | `[]` | 通过，总时长 0 |
| 单段 | `[0, 1000)` | 通过 |
| 首尾相接 | `[0,1000)`, `[1000,2000)` | 通过 |
| 部分重叠 | `[0,1500)`, `[1000,2000)` | `OVERLAP` |
| 完全包含 | `[0,3000)`, `[1000,2000)` | `OVERLAP` |
| 完全相同 | `[0,2000)`, `[0,2000)` | `OVERLAP` |
| 乱序输入 | `[2000,3000)`, `[0,1000)` | 通过（内部排序） |
| 多段重叠 | 三段互相交叉 | `OVERLAP` |
| 零长度 | `[1000,1000)` | `INVALID_RANGE` |
| 负开始 | `[-1,1000)` | `INVALID_RANGE` |
| 结束小于开始 | `[2000,1000)` | `INVALID_RANGE` |
| 结束等于视频时长 | 时长 5000，`[4000,5000)` | 通过 |
| 超出视频边界 | 时长 5000，`[4000,5001)` | `OUT_OF_BOUNDS` |
| 多个错误 | 越界且与另一段重叠 | 先报范围/越界，再报重叠；错误码稳定 |

实现约定：

1. 先逐段检查 `start_ms >= 0`、`end_ms > start_ms`、`end_ms <= duration_ms`；任一失败立即返回对应错误。
2. 全部通过后，再按 `start_ms` 排序，逐段比较 `start_ms < prev_end`。
3. `start_ms == prev_end` 允许。
4. 错误码顺序固定：先 `INVALID_RANGE` / `OUT_OF_BOUNDS`，后 `OVERLAP`；前端按顺序展示。

### 3.2 总时长

| 用例 | 期望 |
|---|---|
| 两段 `[0,1000)`、`[2000,3500)` | 2500 ms |
| 空列表 | 0 ms |
| 大值（18 分钟视频） | 用 bigint，不溢出 |
| 相邻段 | 分别相加，不合并 |

### 3.3 业务日

| 用例 | 期望 |
|---|---|
| `2026-10-23T23:59:59+08:00` | 业务日 `2026-10-23` |
| `2026-10-24T00:00:01+08:00` | 业务日 `2026-10-24` |
| 同样的 UTC 时刻 | 按 `Asia/Shanghai` 转换后再归日 |
| 日期范围 `from=10-01,to=10-31` | 包含 10-31 全天，不包含 11-01 |

### 3.4 其他纯函数

- `format_duration_ms`：0、小于 1 分钟、大于 24 小时。
- `frame_to_ms` / `ms_to_frame`：50 fps、10 fps、未知 fps。
- `clamp_segment`：拖动时不能越过相邻片段或视频边界。

## 4. API / 集成测试

### 4.1 认证

| 用例 | 期望 |
|---|---|
| 正确邮箱/密码登录 | 200，Set-Cookie，HttpOnly |
| 错误密码 | 401 `UNAUTHENTICATED`，不泄露账号是否存在 |
| 未登录访问 `/api/auth/me` | 401 |
| 登出后访问受保护接口 | 401 |
| 标注员调用管理员接口 | 403 `FORBIDDEN` |

### 4.2 租户隔离

| 用例 | 期望 |
|---|---|
| 标注员 A 读取租户 B 的任务 | 404 |
| 标注员 A 领取租户 B 的任务 | 404 |
| 标注员 A 读取租户 B 的 assignment | 404 |
| 标注员 A 保存/提交租户 B 的草稿 | 404 |
| 标注员 A 播放租户 B 的视频 | 404 |
| 租户管理员 A 查看租户 B 的任务详情 | 404 |
| 租户管理员 A 查看租户 B 的统计 | 404 |
| 租户管理员 A 给租户 B 创建任务 | 404（使用 B 的 video_id）；请求体里的 tenant_id 被忽略 |
| 平台管理员查看任意租户 | 200 |
| 平台管理员不传 tenant_id 查看统计 | 200，按全部租户汇总 |

### 4.3 任务与领取

| 用例 | 期望 |
|---|---|
| 发布任务 | 201，状态 PUBLISHED |
| 任务列表 | 按 `created_at DESC`；本期不分页 |
| 发布任务时视频属于另一个租户 | 平台管理员 422 `TENANT_MISMATCH`；租户管理员 404 |
| 标题为空或超过 120 字符 | 400 `VALIDATION_ERROR` |
| 标注员领取 PUBLISHED 任务 | 200/201，assignment CLAIMED，task CLAIMED |
| 同一标注员重复领取自己的任务 | 200，返回已有 assignment（幂等） |
| 另一个标注员领取已被领取的任务 | 409 `ALREADY_CLAIMED` |
| 两人并发领取同一任务 | 一个成功，一个 409 |
| 释放自己的 CLAIMED 任务 | 200，assignment RELEASED，task PUBLISHED，草稿删除 |
| 释放已提交任务 | 409 `ASSIGNMENT_NOT_EDITABLE` |
| 管理员重新分配未提交任务 | 200（可选）；旧 assignment RELEASED，草稿删除，新 assignment CLAIMED |

### 4.4 草稿

| 用例 | 期望 |
|---|---|
| 保存两段合法片段 | 200，version+1，返回带 id 的片段 |
| 带已有 id 更新片段 | 200，同一 id，时间变化 |
| 带不属于本 assignment 的 id | 404 / 422，拒绝 |
| 超过 500 段 | 422 `TOO_MANY_SEGMENTS` |
| 保存重叠片段 | 422 `OVERLAP`，旧草稿不变 |
| 保存零长度 | 422 `INVALID_RANGE` |
| 保存超边界 | 422 `OUT_OF_BOUNDS` |
| 用旧 version 保存 | 409 `VERSION_CONFLICT` |
| 提交后保存草稿 | 409 `ASSIGNMENT_NOT_EDITABLE` |
| 保存空列表 | 200，清空草稿 |
| 列表顺序 | 按 start_ms 排序返回 |

### 4.5 提交

| 用例 | 期望 |
|---|---|
| 提交两段合法片段 | 200，status SUBMITTED，`submitted_at` 非空，总时长正确 |
| 空片段且 `confirm_empty=false` | 422 `EMPTY_SUBMISSION_CONFIRMATION_REQUIRED` |
| 空片段且 `confirm_empty=true` | 200，总时长 0 |
| 重复提交 | 409 `ALREADY_SUBMITTED` |
| 提交时用旧 version | 409 `VERSION_CONFLICT` |
| 提交后任务详情 | 片段列表、总时长、提交时间正确 |
| 提交后统计 | 只算一次 |

### 4.6 统计

| 用例 | 期望 |
|---|---|
| 草稿任务 | 不计入 |
| 已释放任务 | 不计入 |
| 已提交任务 | 计入 |
| 空提交任务 | `task_count` 加 1，`total_duration_ms` 为 0 |
| 同一天多个任务 | 求和 |
| 不同租户 | 只统计当前租户 |
| 23:59 提交 | 归当天 |
| 00:01 提交 | 归次日 |
| 没有数据的日期 | 返回 0，不缺失 |
| 日期范围倒置/超长 | 400 `VALIDATION_ERROR` |
| 平台管理员跨租户 | 汇总或按租户筛选正确 |

## 5. 并发测试

| 场景 | 方法 | 期望 |
|---|---|---|
| 两人同时领取 | `asyncio.gather` 两个 claim 请求 | 一个成功，一个 409；DB 只有一个活跃 assignment |
| 双击提交 | 两个 submit 请求并发 | 一个成功，一个 409；统计只算一次 |
| 两个标签页保存草稿 | 同一 version 并发 PUT | 一个成功，一个 409 |
| 释放与提交并发 | release + submit 同时 | 只有一个成功；状态一致 |
| 提交时另一个人领取 | submit + claim | claim 失败或返回已领取，不产生第二个 assignment |

注意：

- 测试要真的并发，不要顺序调用。
- 使用独立数据库连接/会话；避免 SQLAlchemy session 缓存导致“假并发”。
- 部分唯一索引是最后一道防线，测试要覆盖 `IntegrityError` 转 409。

## 6. 视频测试

| 用例 | 方法 | 期望 |
|---|---|---|
| 上传合法 MP4 | 小演示视频 | 200/201，metadata 正确 |
| 上传非视频 | `.txt` 或伪造 content-type | 415 `UNSUPPORTED_VIDEO_TYPE` |
| 上传超大文件 | 用 mock/限制小的测试配置 | 413 `FILE_TOO_LARGE` |
| ffprobe 失败 | 损坏的 MP4 | 422 `VIDEO_PROBE_FAILED`，临时文件清理 |
| 无 Range | `curl -I` | 200，`Accept-Ranges: bytes` |
| 前 1 KB | `Range: bytes=0-1023` | 206，`Content-Range: bytes 0-1023/size` |
| 尾部 Range | `bytes=size-1024-` | 206 |
| 越界 Range | `bytes=size-` | 416 |
| HEAD | `curl -I` | 正确的 `Content-Length`/`Accept-Ranges` |
| 未授权播放 | 另一个租户 | 404 |
| 500 MB 视频 | 手工 | 播放、拖动、跳转正常；服务端内存稳定 |
| AV1 视频 | Chrome + Safari（如可用） | Chrome 正常；Safari 结果记录到 report |

## 7. E2E 场景（Playwright）

### E2E-1 标注员 happy path

1. 登录标注员 A1。
2. 领取任务。
3. 播放/暂停，拖动时间轴创建两段。
4. 保存；刷新；片段仍在。
5. 提交；看到只读状态和总时长。

### E2E-2 重叠阻止

1. 创建 `[0, 3000)`。
2. 尝试创建 `[2000, 4000)`。
3. 前端阻止/高亮；后端 API 直接调用返回 422。

### E2E-3 空提交

1. 不创建片段直接提交。
2. 出现确认框。
3. 确认后提交成功，总时长 0。

### E2E-4 管理员查看

1. 登录租户管理员 A。
2. 打开任务详情，看到片段列表和总时长。
3. 打开统计页，看到当天有效时长。

### E2E-5 租户隔离

1. 登录标注员 B1。
2. 任务列表没有 A 的任务。
3. 直接访问 A 的任务/视频 URL，页面显示 404。

### E2E-6 平台管理员

1. 登录平台管理员。
2. 切换 Alpha/Beta 租户。
3. 两边任务和统计分别正确。

## 8. 手工验收

### 8.1 500 MB 视频

> 2026-10-24 结果：已用 502,453,985 字节 ALOHA 视频验证。Docker/Nginx 上传 39.2 s；ffprobe 识别 1100 s、50 fps、640×480、AV1；Edge `readyState=4`、无解码错误，跳转到 550 s 正常；Range 206。

- [ ] 下载 ALOHA 视频（约 500 MB）。
- [ ] 上传，观察进度条和后端内存。
- [ ] 播放，确认首帧和声音/画面正常。
- [ ] 拖动到 25%、50%、90%，确认不用等整段下载。
- [ ] 跳转到末尾，确认 `duration` 正确。
- [ ] 连续拖动 10 次，页面不崩、不卡死。
- [ ] 后端 RSS 不随播放增长（允许合理缓存）。
- [ ] 对比服务端 `duration_ms` 与浏览器 `video.duration`；差异 > 1000 ms 时 UI 有提示。
- [ ] ALOHA（50 fps）和 Push-T（10 fps）各测一次帧吸附；未知/VFR 视频不做帧吸附。
- [ ] 记录浏览器、编码、结果到 `report.md`。

### 8.2 键盘与防错

- [ ] 空格播放/暂停。
- [ ] `I` / `O` 打点。
- [ ] `←` / `→` 逐帧。
- [ ] `Delete` 删除选中片段。
- [ ] `Ctrl+Z` 撤销。
- [ ] 重叠时不能保存/提交，提示清楚。
- [ ] 未保存离开页面有提示。
- [ ] 提交中按钮禁用，不能重复点击。

### 8.3 视觉与状态

- [ ] 登录页、任务列表、工作台、管理端风格一致。
- [ ] 加载有骨架屏，不是白屏。
- [ ] 空列表有空状态文案。
- [ ] 接口失败有错误提示和重试。
- [ ] 1024px / 1280px / 1440px 宽度不溢出。
- [ ] 焦点可见，按钮有 hover/disabled 状态。
- [ ] 颜色对比度足够，文字不糊。

## 9. 常用命令

```bash
# 后端单测 + 集成测试
cd backend
pytest -q

# 只跑租户隔离
pytest -q tests/integration/test_tenant_isolation.py

# 前端 E2E
cd frontend
npx playwright test

# 视频 Range
curl -I -H "Range: bytes=0-1023" http://localhost:8000/api/videos/<id>/stream

# 一键启动
docker compose up --build
```

## 10. 验收映射

| README 规则 | 测试 |
|---|---|
| 同一任务片段不能重叠 | `test_intervals.py` + `test_draft_overlap` + E2E-2 |
| 有效时长只算已提交 | `test_stats_excludes_draft` + `test_stats_excludes_released` |
| 有效时长计入提交日 | `test_business_day_boundary` + `test_stats_timezone` |
| 租户隔离在后端 | `test_tenant_isolation.py` + E2E-5 |
| 每个已提交任务的时间段列表 | `test_admin_task_detail` + E2E-4 |
| 管理员每天有效时长 | `test_stats_daily` + E2E-4 |
| 视频可标注 | `test_video_range` + 500 MB 手工验收 |
| 交付可运行 | README 从零启动 + `docker compose up` |

## 11. 缺陷记录模板

每次发现 bug，在 `05-ai-collaboration.md` 的验证日志里追加：

| 日期 | 现象 | 根因 | 修复 | 新增测试 |
|---|---|---|---|---|
| 2026-10-24 | 首尾相接被判重叠 | 用了 `start <= prev_end` | 改为 `<` | `test_adjacent_allowed` |

## 12. AI 代码审查清单

每次 AI 改动后，至少检查：

- [ ] 是否信任了客户端传的 `tenant_id`、`duration_ms`、`total_duration_ms`。
- [ ] 是否所有查询都带租户条件。
- [ ] 重叠判断是否是 `start < prev_end`。
- [ ] 统计是否用了 `submitted_at`，而不是 `created_at`。
- [ ] 时区是否正确。
- [ ] 视频流是否鉴权、是否支持 Range、是否整文件读取。
- [ ] 领取/提交是否有事务和唯一约束。
- [ ] 错误码/状态码是否一致。
- [ ] 前端是否有 loading/empty/error/unsaved 状态。
- [ ] 测试是否真的运行过，而不是只生成。
