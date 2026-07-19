Document Status: PLANNED
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A
Depends On: A2 passed

# V3.3-A / A3 授权内核与兼容适配任务

## 目标

建立统一服务端授权判定，优先替换高风险直接 ID 判断，同时保持现有普通用户流程兼容。

## 必须完成

- AuthorizationService：allow/deny、reasonCode、scope、fieldMask、step-up；
- WorkspaceContextService：解析但不信任客户端工作台；
- SensitiveDataMaskService；
- capabilityProcedure / resourceProcedure；
- legacy role、verification 和 project member 适配器；
- 项目详情、项目文件、里程碑提交/验收、后台高风险路由第一批改造；
- 权限允许/拒绝和敏感访问审计。

## 门禁

- 未注册能力默认拒绝；
- 伪造 workspaceId 不放权；
- 查询在数据库层应用数据范围；
- 已撤权文件签名失效；
- 提交者不能验收自己的交付；
- 旧流程回归通过。
