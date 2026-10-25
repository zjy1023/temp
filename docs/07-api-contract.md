# 07 · API 契约

> 实现以本文件为准；`02-architecture.md` 只描述结构和原则。
>
> 所有接口前缀 `/api`。除上传外使用 JSON。认证用 HttpOnly Cookie。

## 1. 通用约定

| 项 | 约定 |
|---|---|
| ID | UUID 字符串 |
| 时间戳 | ISO 8601 UTC，例如 `2026-10-23T08:30:00Z` |
| 时长 | 整数毫秒 |
| 业务日期 | `YYYY-MM-DD`，按 `Asia/Shanghai` |
| 金额/浮点 | 不使用浮点存时长 |
| 列表 | 本期不分页；按 `created_at DESC` |
| 错误 | `{ "code": "...", "message": "...", "details": {...} }` |
| 认证 | `session` HttpOnly Cookie；`SameSite=Lax` |
| 写操作 | 校验 `Origin` 在 `APP_ORIGINS` |
| CORS | 开发用 Vite proxy；生产同源；不开放 `*` |

## 2. 通用错误

| HTTP | code | 说明 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 字段格式/范围错误 |
| 401 | `UNAUTHENTICATED` | 未登录/会话过期 |
| 403 | `FORBIDDEN` | 角色不允许 |
| 404 | `NOT_FOUND` | 资源不存在或无权访问 |
| 409 | `ALREADY_CLAIMED` | 任务已被别人领取 |
| 409 | `ALREADY_SUBMITTED` | 重复提交 |
| 409 | `ASSIGNMENT_NOT_EDITABLE` | 已提交/已释放后编辑 |
| 409 | `VERSION_CONFLICT` | 草稿版本过期 |
| 413 | `FILE_TOO_LARGE` | 上传超过 2 GB |
| 413 | `PAYLOAD_TOO_LARGE` | JSON 超过 1 MB |
| 415 | `UNSUPPORTED_VIDEO_TYPE` | 非 MP4/WebM |
| 422 | `INVALID_RANGE` | `start < 0` 或 `end <= start` |
| 422 | `OUT_OF_BOUNDS` | `end > video.duration_ms` |
| 422 | `OVERLAP` | 片段重叠 |
| 422 | `TOO_MANY_SEGMENTS` | 超过 500 段 |
| 422 | `TENANT_MISMATCH` | 任务租户与视频租户不一致 |
| 422 | `EMPTY_SUBMISSION_CONFIRMATION_REQUIRED` | 空提交未确认 |
| 422 | `VIDEO_PROBE_FAILED` | ffprobe 失败/无视频流 |
| 500 | `INTERNAL_ERROR` | 未预期错误，不暴露堆栈 |

错误示例：

```json
{
  "code": "OVERLAP",
  "message": "时间段与已有片段重叠",
  "details": { "conflict_segment_ids": ["uuid-1", "uuid-2"] }
}
```

## 3. 认证

### POST /api/auth/login

请求：

```json
{ "email": "ann.alpha1@example.com", "password": "Annotator123!" }
```

响应 `200`：

```json
{
  "user": {
    "id": "uuid",
    "email": "ann.alpha1@example.com",
    "display_name": "标注员 Alpha 1",
    "role": "ANNOTATOR",
    "tenant": { "id": "uuid", "name": "Alpha Robotics" }
  }
}
```

同时 `Set-Cookie: session=...; HttpOnly; SameSite=Lax; Path=/`。

错误：`401 UNAUTHENTICATED`，不区分“账号不存在”和“密码错误”。

### POST /api/auth/logout

响应 `204`，清除 Cookie。

### GET /api/auth/me

响应 `200`，同登录响应；未登录 `401`。

## 4. 管理员接口

### GET /api/admin/tenants

仅平台管理员。响应：

```json
{ "tenants": [ { "id": "uuid", "name": "Alpha Robotics" } ] }
```

### POST /api/admin/videos

`multipart/form-data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | File | MP4/WebM，≤ 2 GB |
| `tenant_id` | string | 平台管理员必填；租户管理员忽略 |

响应 `201`：

```json
{
  "video": {
    "id": "uuid",
    "original_name": "demo.mp4",
    "duration_ms": 60000,
    "fps": 30.0,
    "width": 1280,
    "height": 720,
    "codec": "h264",
    "size_bytes": 12345678,
    "poster_url": "/api/videos/uuid/poster",
    "created_at": "2026-10-23T08:00:00Z"
  }
}
```

错误：

- `415 UNSUPPORTED_VIDEO_TYPE`
- `413 FILE_TOO_LARGE`
- `422 VIDEO_PROBE_FAILED`

### GET /api/admin/videos

查询：`tenant_id`（平台管理员可选）。

响应：

```json
{ "videos": [ { "id": "uuid", "original_name": "demo.mp4", "duration_ms": 60000, "fps": 30.0, "codec": "h264", "size_bytes": 12345678, "poster_url": "/api/videos/uuid/poster", "created_at": "..." } ] }
```

### POST /api/admin/tasks

请求：

```json
{
  "tenant_id": "uuid-or-omitted",
  "video_id": "uuid",
  "title": "咖啡制作演示片段标注",
  "description": "标出抓取、移动、放置三个阶段"
}
```

规则：

- 租户管理员：`tenant_id` 忽略，强制本人租户。
- 平台管理员：`tenant_id` 必填；视频必须属于该租户，否则 `422 TENANT_MISMATCH`。
- `title` 1–120 字符；`description` ≤ 2000 字符。
- 视频必须已存在且属于该租户。

响应 `201`：

```json
{
  "task": {
    "id": "uuid",
    "tenant_id": "uuid",
    "video_id": "uuid",
    "title": "咖啡制作演示片段标注",
    "description": "标出抓取、移动、放置三个阶段",
    "status": "PUBLISHED",
    "created_at": "..."
  }
}
```

### GET /api/admin/tasks

查询：`status`（可选）、`tenant_id`（平台管理员可选）。

响应：

```json
{
  "tasks": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "tenant_name": "Alpha Robotics",
      "title": "咖啡制作演示片段标注",
      "status": "SUBMITTED",
      "video": { "id": "uuid", "duration_ms": 60000, "poster_url": "..." },
      "annotator": { "id": "uuid", "display_name": "标注员 Alpha 1" },
      "submitted_at": "2026-10-23T08:30:00Z",
      "total_duration_ms": 12500,
      "created_at": "..."
    }
  ]
}
```

未领取时 `annotator`/`submitted_at`/`total_duration_ms` 为 `null`。

### GET /api/admin/tasks/{task_id}

响应：

```json
{
  "task": { "id": "uuid", "title": "...", "status": "SUBMITTED", "created_at": "..." },
  "tenant": { "id": "uuid", "name": "Alpha Robotics" },
  "video": { "id": "uuid", "original_name": "demo.mp4", "duration_ms": 60000, "fps": 30.0, "codec": "h264", "poster_url": "..." },
  "assignment": {
    "id": "uuid",
    "status": "SUBMITTED",
    "annotator": { "id": "uuid", "display_name": "标注员 Alpha 1" },
    "claimed_at": "...",
    "submitted_at": "2026-10-23T08:30:00Z",
    "total_duration_ms": 12500,
    "version": 5
  },
  "segments": [
    { "id": "uuid", "start_ms": 1000, "end_ms": 6500 },
    { "id": "uuid", "start_ms": 8000, "end_ms": 15000 }
  ]
}
```

- `CLAIMED` 时 `assignment.status = CLAIMED`，`segments` 返回 `[]`（不向管理员暴露草稿内容）。
- `PUBLISHED` 时 `assignment = null`，`segments = []`。

### GET /api/admin/annotators

查询：`tenant_id`（平台管理员可选）。

响应：

```json
{ "annotators": [ { "id": "uuid", "display_name": "标注员 Alpha 1", "email": "ann.alpha1@example.com" } ] }
```

### POST /api/admin/tasks/{task_id}/reassign

可选功能。请求：

```json
{ "annotator_id": "uuid" }
```

规则：

- 只能重分配 `CLAIMED` 任务。
- 新标注员必须属于任务租户。
- 旧 assignment 变 `RELEASED`，草稿删除；新 assignment 变 `CLAIMED`。
- 新标注员与原标注员相同：返回 `409 VALIDATION_ERROR` 或 `200` 不变（实现时二选一并写测试）。

响应 `200`：返回更新后的任务详情（同 `GET /api/admin/tasks/{task_id}`）。

### GET /api/admin/stats/daily

查询：

| 参数 | 必填 | 说明 |
|---|---|---|
| `from` | 是 | 业务日期 `YYYY-MM-DD` |
| `to` | 是 | 业务日期，包含当天 |
| `tenant_id` | 平台管理员可选 | 不传=全部租户汇总；租户管理员忽略 |

规则：

- `from <= to`，跨度 ≤ 366 天。
- 只统计 `SUBMITTED`。
- 缺失日期补 0。
- 时区 `APP_TIMEZONE`。

响应：

```json
{
  "timezone": "Asia/Shanghai",
  "from": "2026-10-01",
  "to": "2026-10-31",
  "days": [
    { "date": "2026-10-01", "total_duration_ms": 0, "task_count": 0, "annotator_count": 0 },
    { "date": "2026-10-02", "total_duration_ms": 5400000, "task_count": 3, "annotator_count": 2 }
  ]
}
```

## 5. 标注员接口

### GET /api/annotator/tasks

响应：

```json
{
  "available": [
    {
      "id": "uuid",
      "title": "咖啡制作演示片段标注",
      "description": "...",
      "video": { "id": "uuid", "duration_ms": 60000, "poster_url": "..." },
      "created_at": "..."
    }
  ],
  "mine": [
    {
      "task_id": "uuid",
      "assignment_id": "uuid",
      "title": "Push-T 片段标注",
      "status": "CLAIMED",
      "segment_count": 2,
      "total_duration_ms": 7000,
      "video": { "id": "uuid", "duration_ms": 60000, "poster_url": "..." }
    }
  ]
}
```

- `available`：本租户 `PUBLISHED` 任务。
- `mine`：自己的 `CLAIMED` + `SUBMITTED` assignment。
- 不返回别人领取的任务。

### POST /api/annotator/tasks/{task_id}/claim

请求：无 body。

响应 `200`：

```json
{
  "assignment": { "id": "uuid", "task_id": "uuid", "status": "CLAIMED", "version": 1 },
  "task": { "id": "uuid", "title": "...", "status": "CLAIMED" },
  "video": { "id": "uuid", "duration_ms": 60000, "fps": 30.0, "codec": "h264" }
}
```

错误：

- `404 NOT_FOUND`：任务不存在/不在本租户。
- `409 ALREADY_CLAIMED`：别人已领取。
- 自己已有活跃 assignment：返回已有 assignment（幂等）。

### GET /api/annotator/assignments/{assignment_id}

响应：

```json
{
  "assignment": {
    "id": "uuid",
    "status": "CLAIMED",
    "version": 3,
    "claimed_at": "...",
    "submitted_at": null,
    "total_duration_ms": null
  },
  "task": { "id": "uuid", "title": "...", "description": "...", "status": "CLAIMED" },
  "video": { "id": "uuid", "duration_ms": 60000, "fps": 30.0, "codec": "h264", "poster_url": "..." },
  "segments": [
    { "id": "uuid", "start_ms": 1000, "end_ms": 6500 }
  ]
}
```

- 只允许本人；别人/其他租户 `404`。
- `SUBMITTED` 时返回只读片段、`submitted_at`、`total_duration_ms`。

### PUT /api/annotator/assignments/{assignment_id}/draft

请求：

```json
{
  "version": 3,
  "segments": [
    { "id": "existing-uuid", "start_ms": 1000, "end_ms": 6500 },
    { "start_ms": 8000, "end_ms": 15000 }
  ]
}
```

规则：

- 只允许 owner、`CLAIMED`。
- `version` 必须等于当前版本，否则 `409 VERSION_CONFLICT`。
- `segments` ≤ 500；`id` 必须属于当前 assignment。
- 先逐段校验范围/边界，再校验重叠。
- 带 `id` 更新，无 `id` 新建，未出现删除。
- 空数组合法（清空草稿）。

响应 `200`：

```json
{
  "version": 4,
  "segments": [
    { "id": "existing-uuid", "start_ms": 1000, "end_ms": 6500 },
    { "id": "new-uuid", "start_ms": 8000, "end_ms": 15000 }
  ],
  "total_duration_ms": 12500,
  "updated_at": "2026-10-23T08:00:00Z"
}
```

错误：`422 INVALID_RANGE` / `OUT_OF_BOUNDS` / `OVERLAP` / `TOO_MANY_SEGMENTS`；`409 ASSIGNMENT_NOT_EDITABLE`。

### POST /api/annotator/assignments/{assignment_id}/submit

请求：

```json
{ "version": 4, "confirm_empty": false }
```

规则：

- 只允许 owner、`CLAIMED`。
- `version` 必须匹配。
- 重新读 DB 片段并校验；不信任客户端。
- 空片段必须 `confirm_empty=true`，否则 `422 EMPTY_SUBMISSION_CONFIRMATION_REQUIRED`。
- 服务端计算 `total_duration_ms`，写 `submitted_at=now()`，assignment/task 改 `SUBMITTED`。
- 重复提交 `409 ALREADY_SUBMITTED`。

响应 `200`：

```json
{
  "assignment_id": "uuid",
  "submitted_at": "2026-10-23T08:30:00Z",
  "total_duration_ms": 12500,
  "task_status": "SUBMITTED"
}
```

### POST /api/annotator/assignments/{assignment_id}/release

规则：

- 只允许 owner、`CLAIMED`。
- 删除草稿片段；assignment `RELEASED`；task `PUBLISHED`。
- 提交后调用 `409 ASSIGNMENT_NOT_EDITABLE`。

响应 `204`。

## 6. 视频接口

### GET /api/videos/{video_id}/stream

权限：

- 平台管理员：任意租户。
- 租户管理员：本租户。
- 标注员：本租户，且该视频属于一个 `PUBLISHED` 任务或自己的 assignment。

请求头：可选 `Range: bytes=start-end`。

响应：

- 无 Range：`200`，`Content-Length`，`Accept-Ranges: bytes`。
- 有 Range：`206`，`Content-Range: bytes start-end/size`，`Content-Length: end-start+1`。
- 越界：`416`，`Content-Range: bytes */size`。
- 未授权：`404`。

响应头：

```text
Accept-Ranges: bytes
Content-Type: video/mp4
Cache-Control: private, max-age=0
```

### GET /api/videos/{video_id}/poster

权限同 stream。响应 `image/jpeg`；没有封面则 `404`。

### HEAD /api/videos/{video_id}/stream

返回与 GET 相同的头，不返回 body。

## 7. 健康检查

### GET /api/health

响应 `200`：

```json
{ "status": "ok" }
```

不需要登录。

## 8. 校验与限制

| 项 | 限制 | 错误 |
|---|---|---|
| 任务标题 | 1–120 字符 | 400 `VALIDATION_ERROR` |
| 任务描述 | ≤ 2000 字符 | 400 |
| 每 assignment 片段 | ≤ 500 | 422 `TOO_MANY_SEGMENTS` |
| JSON body | ≤ 1 MB | 413 `PAYLOAD_TOO_LARGE` |
| 视频文件 | ≤ 2 GB；MP4/WebM | 413 / 415 |
| 片段起止 | 整数；`0 <= start < end <= duration` | 422 |
| 重叠 | 半开区间，`start < prev_end` | 422 `OVERLAP` |
| 统计日期跨度 | ≤ 366 天 | 400 |
| 草稿版本 | 必须匹配 | 409 `VERSION_CONFLICT` |

## 9. 关键流程

### 9.1 登录

```text
POST /auth/login
  -> 200 + Set-Cookie
GET /auth/me
  -> 200 用户/租户/角色
```

### 9.2 领取

```text
GET /annotator/tasks
  -> available / mine
POST /annotator/tasks/{id}/claim
  -> 200 assignment
  -> 409 已被别人领取
```

### 9.3 草稿自动保存

```text
本地修改
  -> debounce 800ms
PUT /draft {version, segments}
  -> 200 {version+1, segments}
  -> 409 VERSION_CONFLICT -> 提示刷新
```

### 9.4 提交

```text
如有未保存修改：先 PUT /draft，拿到新 version
POST /submit {version, confirm_empty}
  -> 200 {submitted_at, total_duration_ms}
  -> 409 ALREADY_SUBMITTED
  -> 422 EMPTY_SUBMISSION_CONFIRMATION_REQUIRED
```

### 9.5 重新分配

```text
POST /admin/tasks/{id}/reassign {annotator_id}
  -> 200 task detail
  -> 旧 assignment RELEASED，草稿删除
  -> 新 assignment CLAIMED，version=1
```

## 10. 前端 API 层要求

- 统一 `fetch` 封装：`credentials: 'include'`，JSON 解析，错误转成 `ApiError`。
- 401：跳登录，保留草稿。
- 403：显示无权限。
- 404：显示资源不存在。
- 409：按 `code` 显示冲突 Modal/Toast。
- 422：把 `details` 映射到字段错误或时间轴冲突提示。
- 上传用 XHR/fetch 带进度；支持取消。
- 所有请求带 `Accept: application/json`；写操作带 `Origin`（浏览器自动）。
- 不在 URL 里放 token。

## 11. OpenAPI

- FastAPI 自动生成 `/docs` 和 `/openapi.json`。
- 开发环境可开放；生产环境可关闭 `/docs` 或加保护。
- 每个路由必须有 `summary`、`response_model`、错误响应说明。
