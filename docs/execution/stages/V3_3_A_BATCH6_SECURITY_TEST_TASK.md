Document Status: PLANNED
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A
Depends On: A5 feature complete

# V3.3-A / A6 越权、安全与迁移验证任务

## 目标

证明新底座不是只有页面可用，而是能抵抗跨组织、跨项目、离职、撤权和职责冲突。

## 测试矩阵

- 同一账号多身份、多个组织；
- 直接 ID 跨组织读取和写入；
- 成员 active/suspended/left/removed；
- 邀请重复、并发、撤销和过期；
- 项目非成员、viewer、执行人、验收人；
- 文件签名在移除/NDA 撤销后失效；
- WebSocket 订阅撤权；
- 认证初审/复审、投诉调查/裁定、资金审核/执行分离；
- 权限管理员自提权阻断；
- 空库/V3.2.4/重复回填/失败恢复；
- 登录、需求、报价、旧物、回收和订单回归。

## 输出

测试清单、失败证据、修复记录、未覆盖环境和 A7 真机验收清单。
