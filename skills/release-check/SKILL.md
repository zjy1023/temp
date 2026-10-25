---
name: release-check
description: 发布前跑全量测试、构建、Docker 启动、视频 Range、seed 和 README 验收。
---

# Release Check

每个里程碑结束和最终提交前执行。

## 检查清单

- [ ] `cd backend && pytest -q` 全绿。
- [ ] `cd frontend && npm run build` 通过。
- [ ] `cd frontend && npx playwright test` 通过。
- [ ] `docker compose up -d --build` 三个服务 healthy。
- [ ] `http://localhost:8080` 可登录。
- [ ] `curl -I -H "Range: bytes=0-1023" .../stream` 返回 206。
- [ ] seed 账号可登录，演示视频可播放。
- [ ] 跨租户任务/视频返回 404。
- [ ] 提交后刷新只读；草稿刷新不丢。
- [ ] README 从零启动步骤可复现。
- [ ] `report.md` 有决策、验证证据、rules/skills、未完成项。
- [ ] 没有提交 `.env`、`storage/`、`node_modules`、`dist`。

## 命令

```bash
cd backend && pytest -q
cd frontend && npm run build
cd frontend && npx playwright test
docker compose up -d --build
```
