---
name: api-contract
description: 检查 API 是否与 docs/07-api-contract.md 一致，错误码、状态码和权限是否正确。
---

# API Contract Review

用于新增/修改路由、Pydantic schema、错误处理之后。

## 检查清单

- [ ] 路径、方法、请求字段、响应字段与 `docs/07-api-contract.md` 一致。
- [ ] 错误响应统一 `{code, message, details}`。
- [ ] 401/403/404/409/413/415/422 的使用与错误码表一致。
- [ ] 资源级越权返回 404；角色不允许返回 403。
- [ ] 列表按 `created_at DESC`，本期不分页。
- [ ] 请求体有长度/数量限制：标题 120、描述 2000、500 段、JSON 1MB。
- [ ] 写操作校验 `Origin`；Cookie 会话生效。
- [ ] 视频流支持 Range、HEAD、416。
- [ ] OpenAPI 的 response_model 与实际响应一致。

## 验证

```bash
cd backend
pytest -q
```
