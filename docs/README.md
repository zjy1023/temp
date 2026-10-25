# 视频片段标注平台 · 文档索引

当前阶段：**方案定稿，待开发**。

题目来源：[phi-software/vibe-coding-challenge](https://github.com/phi-software/vibe-coding-challenge)

## 文档列表

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [00-overview.md](./00-overview.md) | 题目理解、角色、流程、范围、成功标准 | 所有人先看 |
| [01-decisions.md](./01-decisions.md) | 已确认决策、默认项、被拒绝的方案 | 开发前复核 |
| [02-architecture.md](./02-architecture.md) | 技术栈、目录结构、数据模型、API、视频链路、安全 | 开发时对照 |
| [03-implementation-plan.md](./03-implementation-plan.md) | 里程碑、任务拆分、完成定义、风险 | 排期与开发 |
| [04-test-plan.md](./04-test-plan.md) | 单测、集成、租户隔离、并发、视频、E2E、500MB 手工验收 | 写测试与验收 |
| [05-ai-collaboration.md](./05-ai-collaboration.md) | rules/skills、AI 验证流程、report.md 提纲 | 每次 AI 改动后 |
| [06-ui-spec.md](./06-ui-spec.md) | 页面布局、时间轴、键盘、组件、状态、视觉规范 | 写前端时对照 |
| [07-api-contract.md](./07-api-contract.md) | 每个接口的请求/响应/校验/错误码 | 写后端/前端 API 层时对照 |
| [08-self-review.md](./08-self-review.md) | 对照题目的自审、缺口与修正、剩余风险 | 开工前看 |
| [AGENTS.md](../AGENTS.md) | 给 AI 编码工具的硬约束 | 工具自动读取 |

## 阅读顺序

1. `00-overview`：先统一“做什么、不做什么”。
2. `01-decisions`：确认没有拍错板；有异议先改这里。
3. `02-architecture`：按数据模型和 API 开发。
4. `03-implementation-plan`：按里程碑推进。
5. `04-test-plan`：每个里程碑的验收依据。
6. `05-ai-collaboration`：记录验证证据，最后汇总成 `report.md`。

## 维护规则

- **决策只写在 `01-decisions.md`**；其他文档引用决策编号，不重复定义。
- 代码实现与文档冲突时，先停下来确认是改代码还是改文档，不允许“两边各写一套”。
- 每个里程碑结束时更新 `03-implementation-plan.md` 的状态，并在 `05-ai-collaboration.md` 的验证日志里补一行。
- `00-overview.md` 的“成功标准”是最终验收清单，不给代码让步。
