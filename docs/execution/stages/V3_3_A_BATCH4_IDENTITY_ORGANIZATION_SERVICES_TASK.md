Document Status: PLANNED
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A
Depends On: A3 passed

# V3.3-A / A4 身份、认证与组织服务任务

## 目标

完成可供客户端使用的多身份、通用认证、组织、邀请、成员和组织角色 API。

## API 范围

- identity.listMine/create/suspend/reactivate；
- qualification.listMine/submit/supplement/withdraw；
- organization.create/get/listMine/update；
- invitation.create/accept/decline/revoke；
- member.list/suspend/restore/remove/leave；
- organization role list/create/update/assign/revoke；
- capability explain 和权限变更审计。

## 关键规则

- 身份创建不等于认证通过；
- 一个账号同类型身份的唯一策略按 A1 决定；
- 组织最后一个 owner 不可离开或被移除；
- 邀请 token 单次使用、过期、撤销和并发幂等；
- 停职立即失去写权限，历史署名保留；
- 自定义角色只组合已批准能力。
