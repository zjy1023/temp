# 视频片段标注平台 · 交付报告

## 1. 我如何理解题目

这是一个多租户的视频片段标注系统，替代“标注员填表 + 管理员手工汇总”的流程：

- 管理员上传视频、发布任务，查看每个已提交任务的片段和每天的有效时长。
- 标注员登录后领取本租户任务，在视频上标出时间段，提交。
- 每个标注员属于一个租户，租户数据隔离必须在后端完成。
- 四条硬规则：同任务片段不重叠、只算已提交、计入提交日、后端租户隔离。

我把题目当成“规则 + 隔离 + 视频工作台”的闭环，而不是普通 CRUD。

## 2. 关键决策

| 问题 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 技术栈 | React + TS + Vite、FastAPI、PostgreSQL、Docker Compose | Next.js 全栈、Spring Boot、SQLite | 视频 Range、Cookie 鉴权、时区聚合和测试边界清晰；Postgres 支持行锁和部分唯一索引 |
| 任务领取 | 一人独占，领取即锁定 | 多人领取各自提交、管理员指派 | 输出是“每个已提交任务的时间段列表”，单份提交口径最清楚；并发可用行锁 + 部分唯一索引保证 |
| 管理员范围 | 平台管理员 + 租户管理员 | 只做租户管理员 | “发布任务时指定租户”需要跨租户能力，同时能演示真正的租户隔离 |
| 提交后 | 锁定，不可修改 | 管理员退回、标注员撤回 | 统计稳定，避免历史日统计被追溯修改 |
| 空提交 | 允许，前端二次确认 + API `confirm_empty` | 至少 1 段 | “没有有效片段”是合法标注结果，强制造段会污染数据 |
| 区间语义 | 半开区间 `[start, end)`，首尾相接允许 | 闭区间 | 避免边界争议；同账号另一道题也采用此语义 |
| 时间 | 整数毫秒；按 fps 吸附到帧 | 浮点秒 | 50 fps / 10 fps 差异大，浮点累加会漂移 |
| 提交日 | 服务端 `submitted_at`，按 `Asia/Shanghai` 归日 | 客户端时间、UTC | 防止篡改；中国团队晚间提交不能跑到第二天 |
| 视频 | 本地上传 + ffmpeg 合成演示视频 | URL 导入 | 避免 SSRF 和外部链接失效；仓库不提交 500 MB 视频 |
| 视频编码 | AV1 可播，推荐 Chrome/Edge；可选 H.264 转码 | 默认全部转码 | 转码 500 MB 会拖慢上传；README 写清兼容性 |
| 列表 | 不分页，按创建时间倒序 | 分页 | 本期数据量小，减少前端状态复杂度 |

更完整的 30 条决策、被拒绝方案和默认项见 [docs/01-decisions.md](docs/01-decisions.md)。

## 3. 数据模型与状态机

```text
tenants 1 ── N users
tenants 1 ── N videos
tenants 1 ── N tasks
videos  1 ── N tasks
tasks   1 ── N assignments
users   1 ── N assignments
assignments 1 ── N segments
```

- `assignments` 是领取/草稿/提交的主体，`segments` 是独立行，不用 JSON 存整份片段。
- 一个任务最多一个活跃 assignment（`CLAIMED`/`SUBMITTED`），由 PostgreSQL 部分唯一索引保证。
- 任务状态：`PUBLISHED → CLAIMED → SUBMITTED`；释放回到 `PUBLISHED`。
- 提交时把 `total_duration_ms` 快照到 assignment，统计只读快照，不重复计算。
- 表结构和索引见 [docs/02-architecture.md](docs/02-architecture.md)。

## 4. 规则实现与边界

### 4.1 不重叠

- 先逐段校验 `start >= 0`、`end > start`、`end <= video.duration_ms`。
- 全部通过后按 `start_ms` 排序，检查 `start_ms < prev_end`；`==` 允许。
- 草稿和提交都校验全量片段，不只看新增段。
- 前端拖拽时 clamp 到相邻片段；后端仍是最终权威。
- 500 段上限；超过返回 `TOO_MANY_SEGMENTS`。

### 4.2 有效时长

- 只统计 `assignments.status = 'SUBMITTED'`。
- 提交时服务端根据数据库片段重算并快照 `total_duration_ms`，不信任客户端。
- 空提交仍计 `task_count=1`，时长为 0。
- 草稿、`RELEASED`、未领取均不计。

### 4.3 提交日

- `submitted_at` 由服务端生成，存 UTC。
- 统计时按 `Asia/Shanghai` 转成业务日，再分组求和。
- 已验证 `2026-10-23 23:59:59 +08` 和 `2026-10-24 00:00:01 +08` 分属两天。

### 4.4 草稿与提交

- 草稿 `PUT` 全量提交，带可选片段 `id`：已有 ID 更新、无 ID 新建、未出现删除。
- 版本号乐观锁；旧版本返回 `VERSION_CONFLICT`。
- 提交前若前端有未保存修改，先保存再提交；保存失败不提交。
- 提交后片段只读；重复提交 409，草稿写入 409。

## 5. 视频链路

- 上传：流式写盘，2 GB 上限；`ffprobe` 探测时长/fps/分辨率/编码；MP4 做 `-c copy -movflags +faststart`；生成封面。
- 播放：自定义 Range 响应，支持 `206`、`416`、`Content-Range`、`HEAD`；按 1 MB 分块，不整文件读入内存。
- 权限：视频流和封面都鉴权；标注员只能访问本租户 PUBLISHED 任务或自己 assignment 的视频。
- 编码：视频常见为 AV1；推荐 Chrome/Edge，`TRANSCODE_TO_H264` 可选。
- 已实测：22 MB 演示视频上传、**219 MB 合成视频上传（Docker/Nginx，19.8 s）**、Range 206/416、Docker/Nginx 代理播放。
- **502,453,985 字节 ALOHA 视频已实测**：Docker/Nginx 上传 39.2 s；ffprobe 识别为 1100 s、50 fps、640×480、AV1；Edge 播放 `readyState=4`、无解码错误，跳转到 550 s 正常，Range 206。
- **浏览器兼容**：AV1 播放依赖浏览器与系统解码能力；推荐 Chrome/Edge/Firefox，Safari 建议使用 H.264 源。

## 6. 多租户与安全

- 所有查询从 session 取 `tenant_id`；平台管理员筛选租户时显式校验角色。
- 任务、assignment、segment、video、stats 全部带租户条件。
- 任务租户必须等于视频租户，否则 `TENANT_MISMATCH` 或 404。
- 资源级越权返回 404；角色不允许返回 403。
- 登录成功后清空旧 session，防会话固定；Cookie `HttpOnly`、`SameSite=Lax`，生产可 `Secure`。
- 写操作校验 `Origin`；上传限制类型/大小；文件存 Web 根之外。
- 跨租户测试覆盖：任务详情、领取、视频流、统计、任务创建。

## 7. 我如何验证 AI 代码

### 7.1 Rules

项目根目录 [AGENTS.md](AGENTS.md) 是硬约束，写死了：

- 整数毫秒、半开区间、`start < prev_end`。
- 只算 `SUBMITTED`，按 `submitted_at` + `Asia/Shanghai`。
- 服务端计算总时长，不信任客户端。
- 所有查询带 session 租户。
- 视频流必须鉴权 + Range。
- 提交后锁定；空提交必须确认。

### 7.2 Skills

实际创建并使用了 `skills/` 下的检查清单：

- `domain-review`：区间、提交日、快照、版本。
- `tenant-isolation-review`：查询、视频流、统计的租户条件。
- `api-contract`：路径、字段、错误码、权限。
- `ux-review`：加载/空/错误/保存/冲突/只读、键盘。
- `release-check`：全量测试、构建、Docker、Range、README。

### 7.3 自动化证据

- 后端：`pytest -q` → **30 passed**。
  - 单元：相邻允许、部分重叠、包含、相同、零长度、负数、超边界、乱序、时区边界。
  - 集成：登录/角色、跨租户任务/视频/统计、并发领取、释放、重新分配、草稿 ID/版本冲突、重复提交、空提交、统计、Range 206/416、上传探测。
- 前端：功能 E2E **1 passed**；截图用例 **1 passed**（分别运行）。
  - 登录、任务列表、领取、工作台渲染、时间轴拖拽创建片段、自动保存、提交、提交后只读、管理员登录、统计页。
  - 在本地 Vite（5173）和 Docker/Nginx（8080）两种构建上都跑过。
- Docker：`docker compose ps` 三个服务 healthy；`/api/health` 200。
- 视频：`curl -H "Range: bytes=0-1023"` → `206` + `Content-Range`；越界 → `416`；219 MB 合成视频经 Docker/Nginx 上传成功（19.8 s）；502 MB ALOHA 上传 39.2 s，Edge 播放/跳转正常。

### 7.4 AI 生成后被抓到的具体问题

1. **Origin 校验拦住了 127.0.0.1**：浏览器用 `127.0.0.1:5173` 登录时返回“非法来源”。E2E 暴露后，把 `127.0.0.1` 两个端口加入允许列表。
2. **时间轴单击会创建一个 1 帧片段**：拖拽预览初始 `end=start+min`，导致 pointerup 总是创建。E2E 设计时发现，改为单击不创建、必须拖动超过最小帧长。
3. **Docker 存储路径挂错**：compose 把 `./storage` 挂到 `/data/videos`，但应用按 `storage/videos` 作为根，Docker 内视频 404。Docker E2E 暴露后改为 `./storage/videos:/data/videos`。
4. **测试里 UUID 不能直接 JSON 序列化**：pytest 报 `TypeError`，改为 `str(uuid)`。
5. **AI 初始实现容易把重叠写成 `<=`**：领域测试固定了“首尾相接允许”，防止回归。

这些都记录在 [docs/05-ai-collaboration.md](docs/05-ai-collaboration.md) 的验证日志里。

## 8. 未完成 / 不放心

### 未完成

- 任务提交后的退回/重开：本期按锁定策略交付，未实现退回。
- URL 导入视频：本期只接受本地上传。
- 评论/标签、AI 自动分段、多人协作、移动端专门适配、分页、审计日志未包含。
- 未提供公网部署；交付形态是本地 Docker Compose。

### 不放心

- 大文件上传耗时取决于网络；Nginx 超时设为 300 s，慢网络下需要更长等待。
- AV1 播放依赖浏览器与系统解码能力；Safari 建议使用 H.264 源。
- 并发领取在单机 PostgreSQL + 多客户端下验证；未做多实例压测。
- 时区固定为 `Asia/Shanghai`；部署到其他时区需要改配置并接受历史日归集变化。
- Docker 基础镜像依赖 Docker Hub 或镜像加速。

## 9. 如果继续做

1. 扩展浏览器矩阵：Safari/AV1 验证或默认预转码。
2. 记录并优化 500 MB 上传在慢网络下的超时/重试体验。
3. 支持任务退回/重开，并定义新的提交日口径。
4. 加按标注员统计、CSV 导出。
5. 加分页、操作审计、登录限流。
6. 加 GitHub Actions：pytest + Playwright + Docker build。

## 10. 验证日志摘要

| 日期 | 改动 | 验证 | 结果 |
|---|---|---|---|
| 2026-10-23 | 方案文档与决策 | 对照 README 逐条核对 | 通过 |
| 2026-10-24 | M1 数据/认证/seed | pytest 登录、角色、租户 | 通过 |
| 2026-10-24 | M2 视频上传/Range | 22 MB 视频、206/416、Docker | 通过 |
| 2026-10-24 | M3/M4 领取/草稿/提交/统计 | 30 个后端测试 | 通过 |
| 2026-10-24 | M5/M6 前端工作台/管理端 | Playwright 5173 + 8080 | 通过 |
| 2026-10-24 | Docker 一键启动 | 三服务 healthy、浏览器 E2E | 通过 |
| 2026-10-24 | 219 MB 合成视频 | Docker/Nginx 上传 19.8 s、Range 206 | 通过 |
| 2026-10-24 | 502 MB ALOHA AV1 | 上传 39.2 s、Edge readyState=4、跳转 550 s | 通过 |
| 2026-10-24 | 浏览器兼容性 | 自动化矩阵为 Edge/Chromium | 已在 README 说明 AV1 限制 |
| 2026-10-25 | 交付前全面回归与修复 | lint/ruff/单测/E2E/浏览器实测 | `npm run lint` 0 error、`ruff check .` 0 error、30 passed、E2E 通过、1280/1024 无溢出 | 通过 |

更细的日志见 [docs/05-ai-collaboration.md](docs/05-ai-collaboration.md)。
