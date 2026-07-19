> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: HIGH


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.0 Phase 3：金额双读双写与一致性保护

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 在服务层建立唯一 MoneyRepository/adapter，所有 30 个金额写入同时更新旧列和分列。
2. 读路径继续以旧列为主，同时读取分列做一致性比较；记录实体、字段、请求和差值。
3. 支付、退款、托管、结算、订单成交等高风险动作发现不一致时阻断，普通只读页面允许降级并告警。
4. 为历史入口补齐金额转换，禁止路由和数据库函数直接手工乘除 100。
5. 增加并发、事务回滚、幂等重放和异常注入测试。

## 3. 明确不做

- 不切换客户端契约；不删除旧代码路径；不接正式支付。
## 统一执行要求

- 只追加迁移，不修改已发布迁移。
- 权限、最终状态、金额和审计以后端为准。
- 每个实施批次结束后停止并运行相关门禁。
- 完成后输出执行报告、问题清单、迁移报告和干净源码包。

## 4. 验收重点

- 规格、数据、服务端、客户端、自动化、环境和交付七个批次分别验收。
- 运行全局门禁以及本阶段新增的迁移、并发、安全或外部 Provider 测试。
- 对所有未接真实账号的能力明确标记 Sandbox/Stub。

## 5. 退出条件

- 双写覆盖率 100%；连续测试无新不一致；高风险阻断和恢复路径通过。
