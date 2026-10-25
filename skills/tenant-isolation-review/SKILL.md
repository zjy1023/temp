---
name: tenant-isolation-review
description: 检查所有后端查询、视频流、统计和管理员接口是否强制带租户范围。
---

# Tenant Isolation Review

用于每次新增查询、下载、统计或管理员接口之后。

## 检查清单

- [ ] `tenant_id` 从 session 的当前用户取，不从请求体取（平台管理员筛选除外）。
- [ ] 任务、assignment、segment、video、stats 查询都有租户条件。
- [ ] 标注员只能看到本租户 PUBLISHED 任务或自己的 assignment。
- [ ] 视频流和封面做租户/任务可见性校验。
- [ ] 租户管理员不能通过 `tenant_id` 参数访问其他租户。
- [ ] 平台管理员可以跨租户，但角色必须校验。
- [ ] 任务租户必须等于视频租户。
- [ ] 越权返回 404，不泄露资源存在性。
- [ ] 跨租户测试覆盖任务、视频、统计。

## 验证

```bash
cd backend
pytest -q tests/integration/test_tenant_isolation.py
```
