# 02 · 架构设计

## 1. 系统上下文

生产/演示环境：

```text
┌──────────────────────┐
│  Browser             │
│  React SPA           │
└──────────┬───────────┘
           │ HttpOnly Cookie + /api
           ▼
┌──────────────────────┐        /api/*        ┌──────────────────────┐
│  Nginx :8080         │ ───────────────────▶ │  FastAPI :8000       │
│  static + reverse    │                      │  REST API            │
└──────────────────────┘                      └───────┬──────────────┘
                                                      │ SQLAlchemy
                                                      ▼
                                              ┌──────────────────────┐
                                              │ PostgreSQL 16        │
                                              └──────────────────────┘
                                                      │
                                                      ▼
                                              ┌──────────────────────┐
                                              │ storage/videos       │
                                              │ Docker volume        │
                                              └──────────────────────┘
```

本地开发：

```text
Vite :5173 ──proxy /api──▶ FastAPI :8000 ──▶ PostgreSQL :5432
```

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React + TypeScript + Vite | 组件化、类型安全、启动快 |
| 路由 | React Router | 登录、任务列表、工作台、管理端 |
| 服务端状态 | TanStack Query | 缓存、失效、错误重试 |
| 样式 | Tailwind CSS + 少量自定义组件 | 控制视觉一致性，不引入过重 UI 库 |
| 图表 | Recharts 或轻量 SVG | 每日统计柱状图 |
| 后端 | Python 3.12 + FastAPI | 异步、类型友好、OpenAPI 自动文档 |
| ORM | SQLAlchemy 2.0 + Alembic | 数据模型与迁移 |
| 数据库 | PostgreSQL 16 | 行锁、部分唯一索引、时区聚合 |
| 视频 | ffmpeg / ffprobe | 探测时长、fps、编码；封面；可选转码 |
| 鉴权 | HttpOnly Cookie 会话 | 视频流也能自动带凭证 |
| 密码 | Argon2 或 bcrypt | 只存哈希 |
| 后端测试 | pytest + httpx | 单测 + API 集成测试 |
| 前端测试 | Playwright | 关键路径 E2E |
| 部署 | Docker Compose + Nginx | 一条命令启动 |

## 3. 目录结构

```text
video-annotation-platform/
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── docs/
│   ├── README.md
│   ├── 00-overview.md
│   ├── 01-decisions.md
│   ├── 02-architecture.md
│   ├── 03-implementation-plan.md
│   ├── 04-test-plan.md
│   ├── 05-ai-collaboration.md
│   ├── 06-ui-spec.md
│   ├── 07-api-contract.md
│   └── 08-self-review.md
├── skills/
│   ├── domain-review/
│   ├── api-contract/
│   ├── tenant-isolation-review/
│   ├── ux-review/
│   └── release-check/
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── time.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   └── base.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── health.py
│   │   │   ├── admin_videos.py
│   │   │   ├── admin_tasks.py
│   │   │   ├── admin_stats.py
│   │   │   ├── annotator_tasks.py
│   │   │   └── videos.py
│   │   ├── domain/
│   │   │   ├── intervals.py
│   │   │   └── errors.py
│   │   ├── services/
│   │   │   ├── auth.py
│   │   │   ├── videos.py
│   │   │   ├── tasks.py
│   │   │   ├── assignments.py
│   │   │   └── stats.py
│   │   └── seed.py
│   └── tests/
│       ├── conftest.py
│       ├── unit/
│       ├── integration/
│       └── e2e_api/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── e2e/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       ├── auth/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── styles/
├── scripts/
│   ├── generate_demo_video.py
│   └── verify_range.ps1
└── storage/            # gitignore
    ├── videos/
    └── posters/
```

## 4. 数据模型

### 4.1 实体关系

```text
tenants 1 ── N users
tenants 1 ── N videos
tenants 1 ── N tasks
videos  1 ── N tasks
tasks   1 ── N assignments
users   1 ── N assignments
assignments 1 ── N segments
```

一个任务最多一个活跃 assignment（`CLAIMED` 或 `SUBMITTED`），由部分唯一索引保证。

### 4.2 表设计

#### tenants

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| name | text | not null, unique |
| created_at | timestamptz | not null, default now() |

#### users

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | nullable；平台管理员为空 |
| role | enum | `PLATFORM_ADMIN` / `TENANT_ADMIN` / `ANNOTATOR` |
| email | citext/text | not null, unique, 小写 |
| password_hash | text | not null |
| display_name | text | not null |
| created_at | timestamptz | not null |

约束：

```sql
CHECK (
  (role = 'PLATFORM_ADMIN' AND tenant_id IS NULL)
  OR (role <> 'PLATFORM_ADMIN' AND tenant_id IS NOT NULL)
)
```

#### videos

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants, not null |
| original_name | text | not null |
| storage_key | text | not null, unique |
| poster_key | text | nullable |
| content_type | text | not null |
| size_bytes | bigint | not null, > 0 |
| duration_ms | bigint | not null, > 0 |
| fps | numeric(10,3) | nullable |
| width | int | nullable |
| height | int | nullable |
| codec | text | nullable |
| created_by | UUID | FK users |
| created_at | timestamptz | not null |

#### tasks

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants, not null |
| video_id | UUID | FK videos, not null |
| title | text | not null |
| description | text | nullable |
| status | enum | `PUBLISHED` / `CLAIMED` / `SUBMITTED` / `ARCHIVED` |
| created_by | UUID | FK users |
| created_at | timestamptz | not null |
| published_at | timestamptz | not null |

本期创建任务即发布，不单独做 `DRAFT` 状态；`ARCHIVED` 可选。

#### assignments

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| task_id | UUID | FK tasks, not null |
| tenant_id | UUID | FK tenants, not null |
| annotator_id | UUID | FK users, not null |
| status | enum | `CLAIMED` / `SUBMITTED` / `RELEASED` |
| claimed_at | timestamptz | not null |
| submitted_at | timestamptz | nullable |
| total_duration_ms | bigint | nullable |
| version | int | not null, default 1 |
| updated_at | timestamptz | not null |

约束：

```sql
CHECK (
  (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND total_duration_ms IS NOT NULL)
  OR (status <> 'SUBMITTED' AND submitted_at IS NULL AND total_duration_ms IS NULL)
)
```

部分唯一索引：

```sql
CREATE UNIQUE INDEX one_active_assignment_per_task
ON assignments(task_id)
WHERE status IN ('CLAIMED', 'SUBMITTED');
```

#### segments

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID | PK |
| assignment_id | UUID | FK assignments, not null, on delete cascade |
| start_ms | bigint | not null, >= 0 |
| end_ms | bigint | not null, > start_ms |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |

约束：

```sql
CHECK (start_ms >= 0)
CHECK (end_ms > start_ms)
```

`end_ms <= videos.duration_ms` 是跨表约束，在服务层校验；如果要做数据库级兜底，可加触发器，但本期不强制。

### 4.3 索引

```sql
CREATE INDEX idx_tasks_tenant_status ON tasks(tenant_id, status, created_at DESC);
CREATE INDEX idx_videos_tenant ON videos(tenant_id, created_at DESC);
CREATE INDEX idx_assignments_annotator ON assignments(annotator_id, status);
CREATE INDEX idx_assignments_stats ON assignments(tenant_id, submitted_at)
  WHERE status = 'SUBMITTED';
CREATE INDEX idx_segments_assignment_start ON segments(assignment_id, start_ms);
```

### 4.4 一致性与边界

| 边界 | 规则 | 实现位置 |
|---|---|---|
| 任务与视频租户 | `task.tenant_id == video.tenant_id`；平台管理员选错租户返回 `422 TENANT_MISMATCH`；租户管理员使用其他租户视频返回 404 | 创建任务服务 |
| assignment 与 task 租户 | `assignment.tenant_id == task.tenant_id`；不允许跨租户领取 | 领取/重分配服务 |
| 活跃 assignment | 一个 task 最多一个 `CLAIMED`/`SUBMITTED`；部分唯一索引兜底 | DB + 领取事务 |
| 草稿片段 ID | 请求可带 `id`；已有 ID 更新、无 ID 新建、未出现删除；ID 必须属于当前 assignment | 草稿服务 |
| 片段数量 | 每个 assignment ≤ 500 段；超过返回 `422 TOO_MANY_SEGMENTS` | 草稿/提交服务 |
| 文本长度 | 标题 1–120 字符；描述 ≤ 2000 字符 | Pydantic schema |
| JSON 体积 | ≤ 1 MB；超过返回 413 | FastAPI/反向代理 |
| 上传体积 | ≤ 2 GB；超过返回 413；nginx 也要配置 | 上传服务 + nginx |
| 帧率 | `fps` 可空；优先 `avg_frame_rate`，回退 `r_frame_rate`；VFR/未知时前端不吸附帧 | ffprobe + 前端 |
| 视频时长 | 以服务端 `duration_ms` 为准；浏览器差异 > 1000 ms 时 UI 提示 | 上传服务 + 播放器 |
| 空提交 | 允许；`task_count` 仍计 1，`total_duration_ms` 为 0 | 提交/统计 |
| 时区变更 | 修改 `APP_TIMEZONE` 会改变历史日归集；上线后不随意改，写进 README | 配置 + 文档 |
| 删除 | 本期不做任务/视频/租户删除；避免统计和引用断裂 | 不提供删除 API |
| 列表 | 不分页；按 `created_at DESC`；前端本地筛选 | API |

## 5. 状态机

### Task

```text
PUBLISHED ──claim──▶ CLAIMED ──submit──▶ SUBMITTED
    ▲                   │
    └──── release ──────┘

任意状态 ──archive（可选）──▶ ARCHIVED
```

规则：

- 只有 `PUBLISHED` 能被领取。
- 领取成功同事务把 task 改为 `CLAIMED`。
- 提交成功同事务把 task 改为 `SUBMITTED`。
- 释放成功同事务把 task 改回 `PUBLISHED`。
- `SUBMITTED` 不可回退；本期不支持重开。

### Assignment

```text
CLAIMED ──submit──▶ SUBMITTED
   │
   └──release──▶ RELEASED
```

规则：

- `CLAIMED` 可编辑草稿。
- `SUBMITTED` 只读。
- `RELEASED` 保留审计记录，草稿片段删除；任务回到任务池。
- 同一个任务最多一个 `CLAIMED`/`SUBMITTED`。

## 6. API 契约

所有接口前缀 `/api`。JSON 请求/响应使用 camelCase 或 snake_case 均可，但必须全局一致；本文按 snake_case 描述，前端在 API 层做一次映射也可以。

### 6.1 认证

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | `/api/auth/login` | 公开 | `{email, password}`；成功设置 HttpOnly Cookie |
| POST | `/api/auth/logout` | 已登录 | 清除 Cookie |
| GET | `/api/auth/me` | 已登录 | 返回 `{user, tenant, role}` |

登录响应示例：

```json
{
  "user": {
    "id": "uuid",
    "email": "ann.a1@example.com",
    "display_name": "标注员 A1",
    "role": "ANNOTATOR",
    "tenant": { "id": "uuid", "name": "Alpha Robotics" }
  }
}
```

### 6.2 管理员

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/api/admin/tenants` | 平台管理员 | 租户列表 |
| POST | `/api/admin/videos` | 管理员 | multipart 上传视频；平台管理员可指定租户 |
| GET | `/api/admin/videos` | 管理员 | 视频列表（按租户过滤） |
| POST | `/api/admin/tasks` | 管理员 | 创建并发布任务 |
| GET | `/api/admin/tasks` | 管理员 | 任务列表；支持 `status`、`tenant_id` |
| GET | `/api/admin/tasks/{task_id}` | 管理员 | 任务详情 + 视频 + assignment + 已提交片段 |
| GET | `/api/admin/annotators` | 管理员 | 本租户标注员列表；平台管理员可按租户 |
| POST | `/api/admin/tasks/{task_id}/reassign` | 管理员 | 可选：重新分配未提交任务 |
| GET | `/api/admin/stats/daily` | 管理员 | 每日有效时长 |

创建任务请求：

```json
{
  "tenant_id": "uuid-or-omitted-for-tenant-admin",
  "video_id": "uuid",
  "title": "咖啡制作演示片段标注",
  "description": "标出抓取、移动、放置三个阶段"
}
```

任务详情响应要点：

```json
{
  "task": { "id": "...", "title": "...", "status": "SUBMITTED" },
  "video": { "id": "...", "duration_ms": 60000, "fps": 30 },
  "assignment": {
    "id": "...",
    "annotator": { "id": "...", "display_name": "标注员 A1" },
    "submitted_at": "2026-10-23T08:30:00Z",
    "total_duration_ms": 12500
  },
  "segments": [
    { "id": "...", "start_ms": 1000, "end_ms": 6500 },
    { "id": "...", "start_ms": 8000, "end_ms": 15000 }
  ]
}
```

统计请求：

```text
GET /api/admin/stats/daily?from=2026-10-01&to=2026-10-31&tenant_id=uuid
```

统计响应：

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

### 6.3 标注员

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/api/annotator/tasks` | 标注员 | 返回 `available` + `mine` |
| POST | `/api/annotator/tasks/{task_id}/claim` | 标注员 | 独占领取 |
| GET | `/api/annotator/assignments/{assignment_id}` | 标注员 | assignment + 任务 + 视频 + 片段 |
| PUT | `/api/annotator/assignments/{assignment_id}/draft` | 标注员 | 全量替换草稿 |
| POST | `/api/annotator/assignments/{assignment_id}/submit` | 标注员 | 提交并锁定 |
| POST | `/api/annotator/assignments/{assignment_id}/release` | 标注员 | 释放未提交任务 |

列表行为：本期不分页；任务/视频按 `created_at DESC`；标注员任务池返回 `available`（本租户 PUBLISHED）和 `mine`（自己的 CLAIMED/SUBMITTED）。详细字段见 `07-api-contract.md`。

草稿请求：

```json
{
  "version": 3,
  "segments": [
    { "id": "existing-uuid", "start_ms": 1000, "end_ms": 6500 },
    { "start_ms": 8000, "end_ms": 15000 }
  ]
}
```

草稿响应：

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

`id` 可选：带 `id` 表示更新已有片段（必须属于当前 assignment）；不带 `id` 表示新建；响应中未出现的旧片段会被删除。

提交请求：

```json
{
  "version": 4,
  "confirm_empty": false
}
```

提交响应：

```json
{
  "assignment_id": "uuid",
  "submitted_at": "2026-10-23T08:30:00Z",
  "total_duration_ms": 12500,
  "task_status": "SUBMITTED"
}
```

空片段时必须 `confirm_empty: true`，否则返回 `422 EMPTY_SUBMISSION_CONFIRMATION_REQUIRED`。

### 6.4 视频

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/api/videos/{video_id}/stream` | 已登录 + 有访问权 | 支持 Range 的视频流 |
| GET | `/api/videos/{video_id}/poster` | 已登录 + 有访问权 | 封面图 |

### 6.5 健康检查

```text
GET /api/health -> 200 {"status":"ok"}
```

## 7. 权限矩阵

| 资源/操作 | 标注员 | 租户管理员 | 平台管理员 |
|---|---|---|---|
| 登录/登出/me | ✓ | ✓ | ✓ |
| 本租户可领取任务 | ✓ | ✓（只读） | ✓（只读） |
| 领取任务 | ✓ | — | — |
| 编辑自己的草稿 | ✓ | — | — |
| 提交自己的任务 | ✓ | — | — |
| 释放自己的任务 | ✓ | — | — |
| 创建/发布任务 | — | 本租户 | 任意租户 |
| 上传视频 | — | 本租户 | 任意租户 |
| 查看任务详情 | — | 本租户 | 任意租户 |
| 查看已提交片段 | — | 本租户 | 任意租户 |
| 查看标注员列表 | — | 本租户 | 任意租户 |
| 重新分配未提交任务 | — | 本租户 | 任意租户 |
| 每日统计 | — | 本租户 | 任意租户/全部 |
| 视频流/封面 | 本租户且有可见任务 | 本租户 | 任意租户 |

资源级越权（跨租户、非本人资源）统一返回 `404 NOT_FOUND`，避免泄露资源是否存在；角色不允许（例如标注员调用管理员接口）返回 `403 FORBIDDEN`。

## 8. 视频链路

### 8.1 上传

1. `POST /api/admin/videos`，`multipart/form-data`，字段 `file`，平台管理员可带 `tenant_id`。
2. 校验 `Content-Type`/扩展名：MP4、WebM；最大 2 GB。
3. 流式写入临时文件，边写边计数；超过限制立即中止并删除。
4. `ffprobe` 探测：
   - 时长：`format.duration`（秒，转毫秒）
   - 视频流：`codec_name`、`width`、`height`、`r_frame_rate`
   - 无视频流、时长 <= 0、解析失败 → `422 VIDEO_PROBE_FAILED`
5. 可选 faststart remux：
   ```bash
   ffmpeg -v error -i input.mp4 -c copy -movflags +faststart output.mp4
   ```
   `-c copy` 不重编码，速度快；失败则保留原文件并记录警告。
6. 可选 H.264 转码（`TRANSCODE_TO_H264=true` 时）：
   ```bash
   ffmpeg -i input.mp4 -c:v libx264 -preset veryfast -crf 23 -c:a aac -movflags +faststart output.mp4
   ```
   默认关闭，避免 500 MB 上传等待过久；Safari 兼容性写进 README。
7. 移动到 `storage/videos/{tenant_id}/{uuid}.mp4`；原文件名存 DB。
8. 生成封面：
   ```bash
   ffmpeg -ss 1 -i input.mp4 -frames:v 1 -vf scale=640:-2 poster.jpg
   ```
9. 写 `videos` 表；返回 `{id, duration_ms, fps, width, height, codec, size_bytes, poster_url}`。
10. 任一步失败：删除临时文件/半成品，不写 DB，返回明确错误。

### 8.2 播放与 Range

前端：

```html
<video src="/api/videos/{id}/stream" preload="metadata" playsinline></video>
```

后端：

- 先鉴权 + 租户/任务可见性检查，再打开文件。
- 支持 `HEAD` 和 `GET`。
- 解析 `Range: bytes=start-end`：
  - 合法：`206`，`Content-Range: bytes start-end/size`，`Content-Length: end-start+1`，`Accept-Ranges: bytes`。
  - 越界：`416`，`Content-Range: bytes */size`。
  - 无 Range：`200`，`Accept-Ranges: bytes`，`Content-Length: size`。
- 分块读取（1 MB），不要 `read()` 整个文件。
- `Cache-Control: private, max-age=0`；不要跨租户缓存。
- Cookie 鉴权；不要把 token 放 URL。

验收：

```bash
curl -I -H "Range: bytes=0-1023" http://localhost:8000/api/videos/<id>/stream
```

期望 `206`、`Content-Range`、`Accept-Ranges`。如果框架的 `FileResponse` 已支持 Range，直接用它；否则自己写响应。不能返回 `200` + 整个文件。

### 8.3 Nginx 配置要点

```nginx
client_max_body_size 2g;
proxy_request_buffering off;   # 上传大文件不落 nginx 临时盘
proxy_buffering off;           # 视频流不整段缓冲
proxy_read_timeout 300s;
proxy_send_timeout 300s;
client_body_timeout 300s;
proxy_http_version 1.1;
```

注意：超过 `client_max_body_size` 时，nginx 会直接返回 HTML 413，不经过后端。前端要能处理非 JSON 错误；或者把 nginx 限制设得略大于后端限制，让后端返回统一 JSON。

### 8.4 浏览器与编码

| 编码 | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| H.264/MP4 | ✓ | ✓ | ✓ |
| AV1/MP4 | ✓ | ✓ | 视版本/硬件，可能不支持 |

AV1 播放取决于浏览器与系统解码能力；服务端提供 `TRANSCODE_TO_H264` 开关，可将上传视频转为 H.264 以覆盖更多环境。

数据与素材：

- 仓库只保存 ffmpeg 生成的演示视频；大型视频不进入版本库。
- 演示视频由 ffmpeg `testsrc2` 生成，不涉及第三方版权。
- 上传视频的版权与使用许可由上传方负责。

## 9. 统计口径

### 9.1 定义

- 只统计 `assignments.status = 'SUBMITTED'`。
- 每个提交的 `total_duration_ms` 在提交时由服务端根据片段计算并快照。
- 片段不重叠，所以 `sum(end_ms - start_ms)` 不会重复计算。
- 空提交仍然算一个已提交任务：`task_count` 加 1，`total_duration_ms` 为 0。
- 业务日按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）归集。
- 日期范围 `[from, to]` 是业务日期，闭区间；转换成 UTC 时是半开区间 `[from 00:00, to+1 00:00)`。
- 修改 `APP_TIMEZONE` 会改变历史日归集；上线后不要随意改，README 要注明。

### 9.2 SQL

```sql
SELECT (a.submitted_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
       SUM(a.total_duration_ms) AS total_duration_ms,
       COUNT(*) AS task_count,
       COUNT(DISTINCT a.annotator_id) AS annotator_count
FROM assignments a
WHERE a.status = 'SUBMITTED'
  AND a.tenant_id = :tenant_id
  AND a.submitted_at >= :from_utc
  AND a.submitted_at < :to_utc
GROUP BY 1
ORDER BY 1;
```

平台管理员不传 `tenant_id` 时去掉租户条件；如果需要按租户拆分，再加 `GROUP BY tenant_id` 或单独接口。

### 9.3 展示

- 内部单位统一毫秒，展示为“X 小时 Y 分”或 `X.XX 小时`。
- 一天总时长可能超过 24 小时，不要用 `HH:MM:SS`（会让人误以为是时刻）。
- 缺失日期补 0；图表不要断档。
- 页面上标注时区，例如“按 Asia/Shanghai 归日”。

## 10. 并发与一致性

### 10.1 领取

```text
BEGIN
  SELECT * FROM tasks WHERE id = :task_id AND tenant_id = :tenant FOR UPDATE;
  -- 校验 status = PUBLISHED
  INSERT INTO assignments (...) VALUES (...);
  UPDATE tasks SET status = 'CLAIMED' WHERE id = :task_id;
COMMIT
```

- 部分唯一索引兜底；捕获唯一冲突返回 `409 ALREADY_CLAIMED`。
- 同一个标注员已有自己的活跃 assignment：返回已有 assignment（幂等），不要重复创建。
- 其他标注员已领取：`409 ALREADY_CLAIMED`。

### 10.2 草稿保存

- `PUT` 全量替换；请求带 `version`。
- 事务内 `SELECT ... FOR UPDATE` 锁 assignment。
- 校验 owner、status = CLAIMED、version 匹配。
- 校验全量片段：范围、边界、重叠。
- 删除旧片段、插入新片段、`version += 1`、更新 `updated_at`。
- 版本不匹配：`409 VERSION_CONFLICT`，前端提示刷新。

### 10.3 提交

- 事务内锁 assignment。
- 校验 owner、status = CLAIMED、version。
- 重新读 DB 里的片段并校验（不信任客户端）。
- 空片段且 `confirm_empty != true`：`422`。
- 计算 `total_duration_ms`；写 `submitted_at = now()`、`status = SUBMITTED`。
- 同事务把 task 改为 `SUBMITTED`。
- 重复提交：`409 ALREADY_SUBMITTED`。
- 提交后任何草稿写入：`409 ASSIGNMENT_NOT_EDITABLE`。

### 10.4 释放

- 只有 owner、status = CLAIMED 可释放。
- 删除草稿片段；assignment 改为 `RELEASED`；task 改回 `PUBLISHED`。
- 释放后可以重新领取，生成新的 assignment。

### 10.5 重新分配（可选）

- 管理员只能重分配 `CLAIMED` 状态的任务；`SUBMITTED` 不可动。
- 事务内锁 task 和旧 assignment。
- 旧 assignment 改为 `RELEASED`，删除其草稿片段。
- 创建新 assignment（`CLAIMED`，新标注员，version = 1）。
- task 保持 `CLAIMED`。
- 旧标注员刷新后看到任务已不属于自己，返回 404/已释放提示。

### 10.6 隔离级别

PostgreSQL 默认 `READ COMMITTED` 足够；关键是行锁 + 部分唯一索引。不要用“先查再插”而不加锁。

### 10.7 会话与 CSRF

- 登录成功后重新生成 session，防止会话固定。
- Cookie：`HttpOnly`、`SameSite=Lax`；生产环境 `Secure`。
- 所有写操作校验 `Origin`/`Referer` 是否在 `APP_ORIGINS` 中。
- 登出清除 session；会话过期返回 401，前端保留本地草稿并提示重新登录。
- 登录接口可加简单限流；本期不做复杂风控。

## 11. 错误码

统一格式：

```json
{
  "code": "OVERLAP",
  "message": "时间段与已有片段重叠",
  "details": { "conflict_segment_ids": ["..."] }
}
```

| HTTP | code | 场景 |
|---|---|---|
| 401 | `UNAUTHENTICATED` | 未登录/会话过期 |
| 403 | `FORBIDDEN` | 角色不允许 |
| 404 | `NOT_FOUND` | 资源不存在或无权访问 |
| 400 | `VALIDATION_ERROR` | 请求体格式/字段错误 |
| 409 | `ALREADY_CLAIMED` | 任务已被别人领取 |
| 409 | `ALREADY_SUBMITTED` | 重复提交 |
| 409 | `ASSIGNMENT_NOT_EDITABLE` | 已提交/已释放后改草稿 |
| 409 | `VERSION_CONFLICT` | 草稿版本过期 |
| 422 | `INVALID_RANGE` | `start < 0` 或 `end <= start` |
| 422 | `OUT_OF_BOUNDS` | `end > video.duration_ms` |
| 422 | `OVERLAP` | 片段重叠 |
| 422 | `EMPTY_SUBMISSION_CONFIRMATION_REQUIRED` | 空提交未确认 |
| 422 | `TOO_MANY_SEGMENTS` | 单个 assignment 超过 500 段 |
| 422 | `TENANT_MISMATCH` | 任务租户与视频租户不一致 |
| 413 | `FILE_TOO_LARGE` | 上传超过 2 GB |
| 413 | `PAYLOAD_TOO_LARGE` | JSON 请求超过 1 MB |
| 415 | `UNSUPPORTED_VIDEO_TYPE` | 非 MP4/WebM |
| 422 | `VIDEO_PROBE_FAILED` | ffprobe 失败/无视频流 |
| 500 | `INTERNAL_ERROR` | 未预期错误 |

## 12. 配置项

`.env.example`：

```dotenv
DATABASE_URL=postgresql+psycopg://app:app@db:5432/app
SESSION_SECRET=replace-me-with-a-long-random-string
APP_ENV=development
APP_TIMEZONE=Asia/Shanghai
APP_ORIGINS=http://localhost:8080,http://localhost:5173,http://127.0.0.1:8080,http://127.0.0.1:5173
SESSION_COOKIE_SECURE=false
STORAGE_DIR=/data/videos
MAX_UPLOAD_BYTES=2147483648
TRANSCODE_TO_H264=false
DEMO_MODE=true
```

前端：

```dotenv
VITE_API_BASE=/api
```

`SESSION_SECRET` 不得提交真实值；`.env` 加入 `.gitignore`。

## 13. 部署拓扑

### docker-compose.yml 服务

| 服务 | 镜像/构建 | 端口 | 说明 |
|---|---|---|---|
| `db` | postgres:16-alpine | 5432（仅内部） | 数据卷 `pgdata`；healthcheck |
| `backend` | `./backend` | 8000（内部） | 启动前 `alembic upgrade head` + seed；卷 `./storage/videos:/data/videos` |
| `frontend` | `./frontend`（多阶段 + nginx） | `8080:80` | 静态文件 + `/api` 反代 |

### 演示账号（seed）

| 角色 | 邮箱 | 密码 | 租户 |
|---|---|---|---|
| 平台管理员 | `platform@example.com` | `Platform123!` | 无（跨租户） |
| 租户管理员 | `admin.alpha@example.com` | `Admin123!` | Alpha Robotics |
| 租户管理员 | `admin.beta@example.com` | `Admin123!` | Beta Robotics |
| 标注员 | `ann.alpha1@example.com` | `Annotator123!` | Alpha Robotics |
| 标注员 | `ann.alpha2@example.com` | `Annotator123!` | Alpha Robotics |
| 标注员 | `ann.beta1@example.com` | `Annotator123!` | Beta Robotics |

仅用于演示；README 要明确提示不要在生产使用这些密码。

### 启动顺序

1. `db` healthy。
2. `backend` 迁移、seed、启动 uvicorn。
3. `frontend` 启动 nginx。

### 本地 dev

```bash
# 数据库
docker compose up -d db

# 后端
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
```

Vite `server.proxy` 把 `/api` 转到 `http://localhost:8000`，保证 Cookie 同源。

## 14. 非功能要求

| 维度 | 要求 |
|---|---|
| 性能 | 时间轴拖动/播放头 60 fps；草稿保存防抖 800 ms；视频不整段读入内存 |
| 安全 | 租户隔离、角色校验、Cookie HttpOnly、上传限制、越权 404、无 SQL 拼接 |
| 可访问性 | 键盘可达、焦点可见、表单有 label、对比度足够 |
| 浏览器 | Chrome/Edge 最新版为主；Firefox 可用；Safari 的 AV1 兼容性写进 README |
| 响应式 | 桌面 1280px 以上最佳；1024px 可用；移动端只保证不崩 |
| 可观测性 | 结构化日志、请求 ID、错误不暴露堆栈；不记录密码/Cookie |
| 可维护性 | 领域逻辑独立于路由和 React；API 契约稳定；测试可复现 |
