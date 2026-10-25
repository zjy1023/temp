# AGENTS.md

本文件是 AI 编码工具的硬约束。任何代码生成、重构、测试都必须遵守。

## 项目

视频片段标注平台（Vibe Coding Challenge）。多租户 Web 应用：

- 管理员上传视频、发布任务、查看每日有效时长。
- 标注员领取任务，在视频上标注时间段，提交。
- 租户之间的数据隔离由后端保证。

先读 `docs/00-overview.md` 和 `docs/01-decisions.md`；实现细节对照 `docs/02-architecture.md`。

## 技术栈

- 前端：React + TypeScript + Vite + TanStack Query + Tailwind CSS
- 后端：Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic
- 数据库：PostgreSQL 16
- 视频：ffmpeg / ffprobe，HTTP Range
- 测试：pytest + httpx；Playwright
- 部署：Docker Compose + Nginx

## 不可违反的领域规则

1. 时间一律存整数毫秒。片段区间是半开区间 `[start_ms, end_ms)`，必须满足 `start_ms >= 0`、`end_ms > start_ms`。
2. 同一个 assignment 内片段不得重叠。排序后 `start_ms < prev_end` 即重叠；`start_ms == prev_end` 允许（首尾相接）。
3. 有效时长只统计 `assignments.status = 'SUBMITTED'`。草稿、`RELEASED`、未领取都不计。
4. 有效时长按 `submitted_at` 在 `APP_TIMEZONE`（默认 `Asia/Shanghai`）的日期归集。不得用 `created_at`，不得用视频内时间。
5. 总时长由服务端根据片段计算并快照。永不信任客户端传来的 `total_duration_ms`。
6. 提交后锁定。`SUBMITTED` assignment 的片段不可修改；重复提交返回 409。
7. 所有查询必须带 session 中的 `tenant_id`。禁止从请求体接受 `tenant_id`（平台管理员按租户筛选时除外，且必须校验角色）。
8. 视频流、封面、任务详情、统计接口都必须鉴权并做租户校验。越权返回 404。
9. 视频播放必须支持 HTTP Range（206 / 416 / `Content-Range`）。不得把整个视频读入内存。
10. 空提交允许，但 API 必须要求 `confirm_empty=true`；前端必须二次确认。
11. `task.tenant_id` 必须等于 `video.tenant_id`；`assignment.tenant_id` 必须等于 `task.tenant_id`。不允许跨租户挂视频或领取。
12. 草稿片段可带可选 `id`：已有 ID 更新、无 ID 新建、未出现删除；ID 必须属于当前 assignment。每个 assignment ≤ 500 段。
13. `fps` 允许为空；优先 `avg_frame_rate`，回退 `r_frame_rate`；VFR/未知帧率时不做帧吸附。视频时长以服务端 `duration_ms` 为准。
14. 不提交大型视频文件；使用 ffmpeg 生成演示视频；README 说明素材来源。

## 安全规则

- 密码只存哈希（Argon2 或 bcrypt），不存明文，不在日志输出。
- 登录成功后重新生成 session，防止会话固定。
- 会话用 HttpOnly Cookie；`SameSite=Lax`；生产 `Secure`；写操作校验 `Origin`。
- 资源 ID 用 UUID；越权统一 404，避免泄露资源存在性。
- 上传限制类型和大小；随机文件名；存储在 Web 根目录之外。
- 禁止 SQL 字符串拼接；使用 ORM 或参数化查询。
- 不在日志、错误响应里输出密码、Cookie、完整 token、堆栈。

## 代码约定

- Python：3.12，类型标注，Ruff，pytest；异步路由用 `async def`。
- TypeScript：`strict: true`，ESLint，函数组件 + hooks。
- 领域逻辑放 `backend/app/domain/`，不得写进路由处理函数或 React 组件。
- 数据库访问放 `backend/app/services/` 或 repository；路由只做参数校验和编排。
- API 错误统一 `{ "code": "...", "message": "...", "details": {...} }`。
- 前端所有异步页面必须有 loading / empty / error 状态。
- 时间显示统一 `mm:ss.SSS`；fps 已知时显示帧号。
- 不引入 Redux、微服务、消息队列、K8s；不新增未在决策文档中的大依赖。

## 测试要求

- 每个领域规则至少一个单测。
- 每个 API 至少一个 happy path + 一个权限/边界测试。
- 租户隔离必须有跨租户测试（任务、视频、统计）。
- 提交/统计必须覆盖：草稿不计入、提交日时区边界、重复提交、空提交 `task_count`。
- 视频必须覆盖：Range 206、416、未授权 404、上传探测失败、服务端/浏览器时长差异。
- 任务/视频必须覆盖：跨租户视频挂任务、草稿 ID 归属、500 段上限、VFR/未知 fps 不吸附。
- 前端关键路径至少一条 Playwright E2E。
- 完成功能前先写失败测试或验收清单；不允许“先写完再补测试”。

## 常用命令

```bash
# 一键启动
docker compose up --build

# 后端
cd backend
pytest -q
ruff check .
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm run dev
npm run build
npm run lint
npx playwright test

# 视频 Range 验收
curl -I -H "Range: bytes=0-1023" http://localhost:8000/api/videos/<id>/stream
```

## 完成定义

功能 + 测试 + 文档 + 手工验收 + 无已知阻塞问题。

- API 契约变更同步到 `docs/02-architecture.md`。
- 决策变更先改 `docs/01-decisions.md`。
- 每次重要改动在 `docs/05-ai-collaboration.md` 的验证日志里记录：改了什么、怎么验证、结果。
- README 必须能从零启动；seed 账号必须可用。

## 禁止事项

- 不要在前端做租户过滤来代替后端隔离。
- 不要用 `created_at` 代替 `submitted_at` 统计。
- 不要用 `<=` 判断重叠。
- 不要把视频整个读进内存，也不要让视频流接口绕过鉴权。
- 不要为了让测试通过而放宽领域规则。
- 不要提交 `.env`、真实密钥、数据库文件、`node_modules`、`dist`、`storage/`。
