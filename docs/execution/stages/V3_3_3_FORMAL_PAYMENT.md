> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: CRITICAL


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.3：正式支付、退款、托管、结算与对账

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 选择首个支付 Provider，先沙箱后生产；保持 provider-registry 可替换。
2. 实现支付意图、客户端确认、服务端回调验签、事件去重和状态推进。
3. 实现部分/全额退款、失败重试、托管入账/释放/退回、平台费用和结算批次。
4. 实现日终对账、差异工单、人工补偿、冻结和审计导出。
5. 补齐商户/收款主体、限额、风控、退款策略、错误态和真机支付流程。

## 3. 明确不做

- 不在金额、云环境、身份安全未通过时开始；不信任客户端支付结果；不直接人工改账。
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

- 沙箱和生产候选回调闭环；账本守恒；对账差异可发现可补偿；安全审查通过。
