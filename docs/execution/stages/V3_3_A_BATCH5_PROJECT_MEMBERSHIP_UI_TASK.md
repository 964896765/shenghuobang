Document Status: PLANNED
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A
Depends On: A4 passed

# V3.3-A / A5 项目成员、工作台与最小 UI 任务

## 目标

让用户在真机上完成身份、组织和工作台基本操作，并把现有项目升级为多成员权限。

## 服务端

- project member invite/accept/decline/remove；
- project role assign/revoke；
- workspace.listAvailable/switch；
- platform staff assign/suspend/revoke；
- 兼容 owner/engineer 字段读取。

## 页面

- 我的身份；
- 认证状态；
- 我的组织；
- 组织成员和邀请；
- 工作台切换；
- 项目成员；
- 最小专业工作台首页。

## UI 原则

- 普通用户现有首页不重排；
- 不为每个身份复制整套页面；
- 工作台卡片显示上下文、岗位、认证和待办；
- 无效/停职工作台不可进入；
- 权限不足使用稳定错误状态，不出现空白页。
